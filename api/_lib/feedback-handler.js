/**
 * Lógica de negocio compartida del feedback de respuestas del chat (👍/👎)
 * y del feedback general de satisfacción (estrellas).
 * Usada por: api/feedback.js, api/general-feedback.js (Vercel prod)
 * y src/routes/api.feedback.ts, src/routes/api.general-feedback.ts (dev local).
 */
import { createRateLimiter } from "./rate-limit.js";

export const MAX_FEEDBACK_TEXT_LENGTH = 3000;
const VALID_SCORES = new Set(["positivo", "negativo"]);

// Feedback no es de uso continuo como el chat: límite más estricto por IP.
const feedbackLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxAttempts: 10 });
const generalFeedbackLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxAttempts: 10 });

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

/**
 * Trunca y sanitiza un fragmento de texto para almacenamiento/registro seguro.
 */
function truncate(text, max) {
  return (text || "").toString().slice(0, max);
}

/**
 * Valida el cuerpo de la petición de feedback de chat.
 */
export function validateFeedbackRequest(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Cuerpo de la petición inválido." };
  }
  const { query, reply, score, comment } = body;

  if (typeof query !== "string" || !query.trim()) {
    return { valid: false, error: "'query' es requerido." };
  }
  if (typeof reply !== "string" || !reply.trim()) {
    return { valid: false, error: "'reply' es requerido." };
  }
  if (!VALID_SCORES.has(score)) {
    return { valid: false, error: "'score' debe ser 'positivo' o 'negativo'." };
  }
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== "string") {
      return { valid: false, error: "'comment' debe ser texto." };
    }
    if (comment.length > MAX_FEEDBACK_TEXT_LENGTH) {
      return {
        valid: false,
        error: `'comment' debe tener máximo ${MAX_FEEDBACK_TEXT_LENGTH} caracteres.`,
      };
    }
  }
  if (query.length > MAX_FEEDBACK_TEXT_LENGTH || reply.length > MAX_FEEDBACK_TEXT_LENGTH) {
    return { valid: false, error: "El texto excede el largo máximo permitido." };
  }

  return {
    valid: true,
    query: query.trim(),
    reply: reply.trim(),
    score,
    comment: (comment || "").trim(),
  };
}

/**
 * Guarda el feedback en Supabase y opcionalmente lo reenvía a un Google Form.
 * No registra la conversación completa en consola: solo metadatos no sensibles.
 */
export async function runFeedbackHandler(body, rateLimitKey = "unknown") {
  if (feedbackLimiter.isLimited(rateLimitKey)) {
    return {
      ok: false,
      status: 429,
      error: "Demasiados envíos en poco tiempo. Espera un momento e intenta de nuevo.",
    };
  }

  const validation = validateFeedbackRequest(body);
  if (!validation.valid) {
    return { ok: false, status: 400, error: validation.error };
  }
  feedbackLimiter.register(rateLimitKey);
  const { query, reply, score, comment } = validation;

  // Solo metadatos, nunca el contenido completo de la conversación.
  console.log(`[FEEDBACK] score=${score} hasComment=${Boolean(comment)}`);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify({
          pregunta: truncate(query, 2000),
          respuesta: truncate(reply, 6000),
          score,
          comentario: truncate(comment, MAX_FEEDBACK_TEXT_LENGTH),
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch (err) {
      console.error("[FEEDBACK] Error al guardar en Supabase:", err.message);
    }
  }

  const googleFormUrl = process.env.GOOGLE_FORM_FEEDBACK_URL;
  if (googleFormUrl) {
    try {
      const qEntry = process.env.GOOGLE_FORM_ENTRY_QUERY || "entry.1";
      const rEntry = process.env.GOOGLE_FORM_ENTRY_REPLY || "entry.2";
      const sEntry = process.env.GOOGLE_FORM_ENTRY_SCORE || "entry.3";
      const cEntry = process.env.GOOGLE_FORM_ENTRY_COMMENT || "entry.4";

      const formData = new URLSearchParams();
      formData.append(qEntry, query);
      formData.append(rEntry, reply);
      formData.append(sEntry, score);
      formData.append(cEntry, comment);

      const formRes = await fetch(googleFormUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      if (!formRes.ok) {
        console.error(`[FEEDBACK] Error al enviar a Google Forms: HTTP ${formRes.status}`);
      }
    } catch (err) {
      console.error("[FEEDBACK] Error al enviar a Google Forms:", err.message);
    }
  }

  return { ok: true };
}

// ─── Feedback general de satisfacción (estrellas) ────────────────────────────

/**
 * Valida el cuerpo de la petición de feedback general (satisfacción).
 */
export function validateGeneralFeedbackRequest(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Cuerpo de la petición inválido." };
  }
  const { rating, comment } = body;

  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { valid: false, error: "'rating' debe ser un entero entre 1 y 5." };
  }
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== "string") {
      return { valid: false, error: "'comment' debe ser texto." };
    }
    if (comment.length > MAX_FEEDBACK_TEXT_LENGTH) {
      return {
        valid: false,
        error: `'comment' debe tener máximo ${MAX_FEEDBACK_TEXT_LENGTH} caracteres.`,
      };
    }
  }

  return { valid: true, rating, comment: (comment || "").trim() };
}

export async function runGeneralFeedbackHandler(body, rateLimitKey = "unknown") {
  if (generalFeedbackLimiter.isLimited(rateLimitKey)) {
    return {
      ok: false,
      status: 429,
      error: "Demasiados envíos en poco tiempo. Espera un momento e intenta de nuevo.",
    };
  }

  const validation = validateGeneralFeedbackRequest(body);
  if (!validation.valid) {
    return { ok: false, status: 400, error: validation.error };
  }
  generalFeedbackLimiter.register(rateLimitKey);
  const { rating, comment } = validation;

  console.log(`[GENERAL FEEDBACK] rating=${rating} hasComment=${Boolean(comment)}`);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/satisfaction_feedback`, {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify({ rating, comentario: truncate(comment, MAX_FEEDBACK_TEXT_LENGTH) }),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        throw new Error(`Supabase respondió HTTP ${response.status}`);
      }
    } catch (err) {
      console.error("[GENERAL FEEDBACK] Error al guardar en Supabase:", err.message);
      return { ok: false, status: 500, error: "Error al guardar en base de datos." };
    }
  }

  return { ok: true };
}
