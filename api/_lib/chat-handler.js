/**
 * Lógica de negocio compartida del endpoint de chat.
 * Usada por: api/chat.js (Vercel prod) y src/routes/api.chat.ts (dev local / Dokku).
 *
 * Los adaptadores (Vercel req/res, Fetch Request/Response) solo hacen
 * marshalling de entrada/salida; toda la validación y orquestación RAG
 * vive aquí para evitar duplicación.
 */
import { buildSystemPrompt, streamAI, logQuestion } from "./rag.js";
import { createRateLimiter } from "./rate-limit.js";
import {
  evaluateScope,
  OUT_OF_SCOPE_REPLY,
  respuestaContieneCodigo,
  CODIGO_INTERCEPTADO_REPLY,
} from "./scope-guard.js";

export const MAX_MESSAGES = 12;
export const MAX_MESSAGE_LENGTH = 3000;

/**
 * Presupuesto de historial que se envía al modelo, en caracteres.
 *
 * Los límites por mensaje no alcanzan: 12 mensajes de 3.000 caracteres suman
 * ~10.900 tokens y, con el system prompt, superan los 8.192 de num_ctx. Cuando la
 * ventana desborda, llama.cpp descarta desde el INICIO, que es exactamente donde
 * va el system prompt. Un alumno puede provocarlo a propósito —rellenando la
 * conversación con mensajes largos— para desalojar las reglas de comportamiento
 * antes de preguntar lo que quiera.
 *
 * El gate de alcance y el corte por código viven en el servidor y no dependen del
 * prompt, así que ese ataque no habilita pedir tareas; lo que sí lograba era
 * quitarle las reglas de "no inventes" y de alcance temático.
 *
 * Cálculo con num_ctx 8192: system prompt ~3.000 tok + contexto RAG ~1.100 +
 * reserva de salida (num_predict) 800 = ~4.900. Quedan ~3.200 tokens para el
 * historial, que a ~3,3 caracteres por token son ~10.500 caracteres.
 */
export const MAX_HISTORY_CHARS = 10000;

const VALID_ROLES = new Set(["user", "assistant"]);

/**
 * Recorta el historial desde el final para que quepa en el presupuesto.
 *
 * Se recorta en vez de rechazar: una conversación larga y legítima debe seguir
 * funcionando, solo que con menos memoria. El último mensaje del usuario siempre
 * se conserva, aunque por sí solo exceda el presupuesto, porque sin él no hay
 * consulta que responder.
 */
export function trimHistory(messages, maxChars = MAX_HISTORY_CHARS) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const recortado = [];
  let total = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const largo = (messages[i]?.content || "").length;
    if (recortado.length > 0 && total + largo > maxChars) break;
    recortado.unshift(messages[i]);
    total += largo;
  }

  return recortado;
}

// Límite por IP. Configurable porque el valor correcto depende de cómo lleguen los
// estudiantes: si la universidad los saca a internet detrás de NAT, TODO el campus
// comparte unas pocas IPs públicas y un límite bajo bloquea a gente inocente. Ojo
// con eso al ajustarlo — es un problema de disponibilidad, no de seguridad.
const CHAT_MAX_POR_IP = Number(process.env.CHAT_RATE_LIMIT || 20);
const chatLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxAttempts: CHAT_MAX_POR_IP });

/**
 * Tope de generaciones simultáneas contra el servidor de inferencia.
 *
 * El límite por IP no protege la GPU: veinte estudiantes distintos, cada uno
 * dentro de su cuota, pueden saturarla igual. Y si comparten NAT, subir la cuota
 * para no bloquearlos empeora justamente eso.
 *
 * Este tope ataca el recurso real. Debe ir alineado con OLLAMA_NUM_PARALLEL: cada
 * slot paralelo reserva su propia caché KV (~1 GiB a 8192 de contexto), así que
 * aceptar más peticiones concurrentes que slots no acelera nada, solo encola y
 * arriesga quedarse sin VRAM.
 */
const MAX_GENERACIONES_CONCURRENTES = Number(process.env.MAX_CONCURRENT_CHATS || 4);
let generacionesEnCurso = 0;

/**
 * Pre-chequeo síncrono de rate limit, para poder rechazar con 429 ANTES de
 * comprometerse a abrir un stream de respuesta (ver src/routes/api.chat.ts).
 */
export function isChatRateLimited(rateLimitKey) {
  return chatLimiter.isLimited(rateLimitKey);
}

/**
 * Valida el cuerpo de la petición de chat.
 * Devuelve { valid: true, messages } o { valid: false, error }.
 */
export function validateChatRequest(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Cuerpo de la petición inválido." };
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: "'messages' debe ser un arreglo no vacío." };
  }

  if (messages.length > MAX_MESSAGES) {
    return {
      valid: false,
      error: `Se permite un máximo de ${MAX_MESSAGES} mensajes por conversación.`,
    };
  }

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      return { valid: false, error: "Cada mensaje debe ser un objeto." };
    }
    if (!VALID_ROLES.has(msg.role)) {
      return { valid: false, error: "El rol del mensaje debe ser 'user' o 'assistant'." };
    }
    if (typeof msg.content !== "string" || !msg.content.trim()) {
      return { valid: false, error: "El contenido del mensaje debe ser texto no vacío." };
    }
    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: `Cada mensaje debe tener máximo ${MAX_MESSAGE_LENGTH} caracteres.`,
      };
    }
  }

  return { valid: true, messages };
}

/**
 * Ejecuta el flujo completo de chat: valida, construye el prompt con RAG,
 * llama a Ollama en streaming y registra la analítica.
 *
 * @param {object} body - Cuerpo de la petición ({ messages }).
 * @param {(chunk: string) => void} onChunk - Callback invocado con cada trozo de texto.
 * @param {string} [rateLimitKey] - Clave de rate limiting (normalmente la IP del cliente).
 * @returns {Promise<{ok: true} | {ok: false, status: number, error: string}>}
 */
export async function runChatHandler(body, onChunk, rateLimitKey = "unknown") {
  if (chatLimiter.isLimited(rateLimitKey)) {
    return {
      ok: false,
      status: 429,
      error: "Demasiados mensajes en poco tiempo. Espera un momento e intenta de nuevo.",
    };
  }

  const validation = validateChatRequest(body);
  if (!validation.valid) {
    return { ok: false, status: 400, error: validation.error };
  }
  chatLimiter.register(rateLimitKey);

  // El historial se recorta ANTES de armar el prompt. Sin esto, un cliente puede
  // enviar 12 mensajes de 3.000 caracteres y desbordar num_ctx a propósito para
  // que llama.cpp descarte el system prompt junto con sus reglas.
  const messages = trimHistory(validation.messages);

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const { systemPrompt, foundDocs } = await buildSystemPrompt(lastUserMessage, messages);

  // foundDocs es un arreglo de documentos, así que hay que contar su largo.
  const foundDocsCount = Array.isArray(foundDocs) ? foundDocs.length : Number(foundDocs) || 0;

  // Control de alcance ANTES de llamar al modelo.
  //
  // La regla 7 del system prompt ya prohíbe resolver tareas, pero es una
  // instrucción, no un mecanismo: sin contexto RAG el modelo igual respondía con
  // su conocimiento propio. Rechazar acá es determinista, no se puede eludir con
  // prompt injection y ahorra una inferencia completa en la GPU.
  const scope = evaluateScope(lastUserMessage, foundDocsCount);
  if (!scope.allowed) {
    onChunk(OUT_OF_SCOPE_REPLY);

    // El motivo queda solo en el log del servidor. No se agrega una columna al
    // insert porque preguntas_log hoy solo tiene `pregunta` y `con_contexto`:
    // mandar un campo inexistente haría que PostgREST responda 400 y, como
    // logQuestion traga los errores, se perderían estos registros en silencio.
    console.warn(`[SCOPE] Consulta fuera de alcance (${scope.reason})`);

    await logQuestion({ pregunta: lastUserMessage, conContexto: false });
    return { ok: true };
  }

  // Se toma el cupo DESPUÉS del gate: las consultas rechazadas no llegan a la GPU,
  // así que no deben ocupar un slot ni contar contra la concurrencia.
  if (generacionesEnCurso >= MAX_GENERACIONES_CONCURRENTES) {
    console.warn(
      `[CARGA] Rechazada por concurrencia (${generacionesEnCurso}/${MAX_GENERACIONES_CONCURRENTES})`,
    );
    return {
      ok: false,
      status: 503,
      error: "El asistente está atendiendo muchas consultas. Intenta de nuevo en unos segundos.",
    };
  }
  generacionesEnCurso++;

  try {
    // Corte por salida: si el modelo empieza a entregar un bloque de código, se
    // deja de reenviar y se explica por qué. Es la única defensa que no depende
    // de cómo esté redactada la pregunta, y por eso existe: enumerar las formas
    // de pedir una tarea no converge ("dame un ejemplo de recursión en Java"
    // pasaba el filtro de entrada).
    //
    // No se aborta la generación en Ollama, solo se corta el reenvío: num_predict
    // acota el desperdicio y evitamos propagar un AbortController por toda la
    // cadena de streaming.
    let acumulado = "";
    let cortadoPorCodigo = false;

    const onChunkFiltrado = (chunk) => {
      if (cortadoPorCodigo) return;

      acumulado += chunk;
      if (respuestaContieneCodigo(acumulado)) {
        cortadoPorCodigo = true;
        console.warn("[SCOPE] Respuesta interceptada: el modelo empezó a entregar código");
        onChunk(CODIGO_INTERCEPTADO_REPLY);
        return;
      }
      onChunk(chunk);
    };

    await streamAI({ messages, systemPrompt, onChunk: onChunkFiltrado });

    await logQuestion({
      pregunta: lastUserMessage,
      // Antes era `foundDocs > 0` con foundDocs ya convertido en arreglo: la
      // comparación daba siempre false, así que el panel de admin marcaba todas
      // las preguntas como sin cobertura.
      conContexto: foundDocsCount > 0,
    });

    return { ok: true };
  } catch (e) {
    // El detalle completo va SOLO a los logs del servidor.
    console.error("[CHAT] Error:", e.message);

    // Al cliente nunca se le devuelve e.message: los errores de rag.js incluyen
    // OLLAMA_BASE_URL (la IP interna del servidor de inferencia on-premise) y el
    // nombre del modelo. Devolverlo tal cual convertía cualquier caída de Ollama
    // en una fuga de la topología de la red interna hacia cualquier usuario.
    return {
      ok: false,
      status: 500,
      error: "El asistente no está disponible en este momento. Intenta de nuevo en unos minutos.",
      streamStarted: true,
    };
  } finally {
    // En finally: si el slot no se libera ante un error o una desconexión, el
    // contador sube sin bajar nunca y el asistente termina rechazando a todos.
    generacionesEnCurso--;
  }
}
