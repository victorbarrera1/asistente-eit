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
  respuestaFueraDeAlcance,
  CLARIFICATION_REPLY,
  INSUFFICIENT_EVIDENCE_REPLY,
  CONVERSATIONAL_REPLY,
} from "./scope-guard.js";

export const MAX_MESSAGES = 12;
export const MAX_MESSAGE_LENGTH = 3000;
export const MAX_RESPONSE_CHARS = 16000;

class ScopeOutputError extends Error {}

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

  if (messages.at(-1).role !== "user") {
    return { valid: false, error: "El último mensaje debe ser del usuario." };
  }

  return { valid: true, messages };
}

/**
 * Admite la consulta antes de cualquier IA y emite como máximo una respuesta
 * completa. El streaming del proveedor es interno: no se publica texto parcial.
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

  const lastUserMessage = validation.messages.at(-1).content;
  const scope = evaluateScope(lastUserMessage, 0, validation.messages.slice(0, -1));
  if (!scope.allowed) {
    const task = scope.reason === "task_request" || scope.reason === "task_followup";
    onChunk(task ? OUT_OF_SCOPE_REPLY : CLARIFICATION_REPLY);
    // Rechazo inmediato: tampoco espera escrituras remotas de analítica.
    console.warn(`[SCOPE] Consulta no admitida (${scope.reason})`);
    return { ok: true, outcome: task ? "out_of_scope" : "clarification" };
  }

  if (scope.reason === "conversational" || scope.reason === "meta") {
    onChunk(CONVERSATIONAL_REPLY);
    return { ok: true, outcome: "answered" };
  }

  // Las respuestas del cliente no son evidencia. Un seguimiento se reconstruye
  // desde la consulta de usuario admitida más reciente, nunca desde un rechazo
  // o una respuesta potencialmente inventada. Una pregunta nueva cambia de tema.
  const query = scope.query ?? lastUserMessage;
  const messages = [{ role: "user", content: query }];

  // El cupo también cubre embeddings y reescrituras de las consultas admitidas.
  if (generacionesEnCurso >= MAX_GENERACIONES_CONCURRENTES) {
    return {
      ok: false,
      status: 503,
      error: "El asistente está atendiendo muchas consultas. Intenta de nuevo en unos segundos.",
    };
  }
  generacionesEnCurso++;

  let streamStarted = false;
  try {
    const { systemPrompt, foundDocs } = await buildSystemPrompt(query);
    const hasEvidence = Array.isArray(foundDocs) && foundDocs.some(
      (doc) => typeof doc.url === "string" && doc.url.trim() &&
        typeof doc.contenido === "string" && doc.contenido.trim(),
    );
    if (!hasEvidence) {
      onChunk(INSUFFICIENT_EVIDENCE_REPLY);
      return { ok: true, outcome: "insufficient_evidence" };
    }

    let accumulated = "";
    try {
      await streamAI({
        messages,
        systemPrompt,
        onChunk(chunk) {
          if (accumulated.length + chunk.length > MAX_RESPONSE_CHARS) {
            throw new Error("Respuesta excede el presupuesto de salida");
          }
          accumulated += chunk;
          if (respuestaFueraDeAlcance(accumulated)) {
            // El lector del proveedor propaga la excepción y cancela el stream.
            throw new ScopeOutputError("Salida fuera de alcance");
          }
        },
      });
    } catch (error) {
      if (!(error instanceof ScopeOutputError)) throw error;
      onChunk(OUT_OF_SCOPE_REPLY);
      console.warn("[SCOPE] Respuesta descartada antes de publicarse");
      return { ok: true, outcome: "out_of_scope" };
    }

    if (!accumulated.trim()) throw new Error("Respuesta vacía del proveedor");
    // El lector exige finalización válida; prefijos, errores y streams truncados
    // no llegan al cliente. Los detectores revisaron TODO el texto acumulado.
    onChunk(accumulated);
    streamStarted = true;
    await logQuestion({ pregunta: lastUserMessage, conContexto: true });
    return { ok: true, outcome: "answered" };
  } catch (error) {
    console.error("[CHAT] Error:", error.message);
    return {
      ok: false,
      status: 502,
      error: "El asistente no está disponible en este momento. Intenta de nuevo en unos minutos.",
      streamStarted,
    };
  } finally {
    generacionesEnCurso--;
  }
}
