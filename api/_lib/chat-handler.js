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
import { collectEvidenceUrls, filterOutputLinks } from "./output-links.js";
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
export const LIMITED_MODE_REPLY =
  "En este momento solo está disponible la orientación general del asistente. " +
  "Para consultar requisitos o reglamentos, revisa el sitio oficial de la Escuela " +
  "en https://eit.udp.cl o contacta a Secretaría de Estudios.";

class ScopeOutputError extends Error {}

const VALID_ROLES = new Set(["user", "assistant"]);

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
 * Tope de generaciones simultáneas POR CLIENTE.
 *
 * Sin esto, un solo cliente dentro de su cuota por IP (20 mensajes / 5 min)
 * podía lanzar 4 peticiones en paralelo, ocupar todos los cupos y dejar al
 * resto con 503 mientras duraran sus generaciones. Por defecto, la mitad de los
 * cupos: deja margen a estudiantes que comparten IP por NAT sin permitir el
 * acaparamiento.
 */
const MAX_GENERACIONES_POR_CLIENTE = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_CHATS_PER_CLIENT) ||
    Math.ceil(MAX_GENERACIONES_CONCURRENTES / 2),
);
const generacionesPorCliente = new Map();

/**
 * Pre-chequeo síncrono de rate limit antes de leer el cuerpo de la petición.
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

  // Interruptor del servidor: una configuración desconocida tampoco autoriza IA.
  // Se evalúa antes de ocupar un cupo o hacer cualquier petición remota.
  const responseMode = (process.env.CHAT_RESPONSE_MODE ?? "guarded").trim().toLowerCase();
  if (responseMode !== "guarded") {
    onChunk(LIMITED_MODE_REPLY);
    return { ok: true, outcome: "limited" };
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
  const enCursoCliente = generacionesPorCliente.get(rateLimitKey) ?? 0;
  if (enCursoCliente >= MAX_GENERACIONES_POR_CLIENTE) {
    return {
      ok: false,
      status: 429,
      error: "Espera a que termine tu consulta anterior antes de enviar otra.",
    };
  }
  generacionesEnCurso++;
  generacionesPorCliente.set(rateLimitKey, enCursoCliente + 1);

  let streamStarted = false;
  try {
    const { systemPrompt, contextDocs } = await buildSystemPrompt(query);
    // Solo cuentan los fragmentos limpios que realmente recibe el modelo.
    const hasEvidence = Array.isArray(contextDocs) && contextDocs.length > 0;
    if (!hasEvidence) {
      onChunk(INSUFFICIENT_EVIDENCE_REPLY);
      await logQuestion({ pregunta: lastUserMessage, conContexto: false });
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
    // Solo se publican enlaces institucionales o presentes en la evidencia.
    const { text: publicable, removed } = filterOutputLinks(
      accumulated,
      collectEvidenceUrls(contextDocs),
    );
    if (removed)
      console.warn(`[SCOPE] ${removed} enlace(s) sin respaldo omitido(s) de la respuesta`);
    // El lector exige finalización válida; prefijos, errores y streams truncados
    // no llegan al cliente. Los detectores revisaron TODO el texto acumulado.
    onChunk(publicable);
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
    const restantes = (generacionesPorCliente.get(rateLimitKey) ?? 1) - 1;
    if (restantes > 0) generacionesPorCliente.set(rateLimitKey, restantes);
    else generacionesPorCliente.delete(rateLimitKey);
  }
}
