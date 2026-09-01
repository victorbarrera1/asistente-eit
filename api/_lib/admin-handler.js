/**
 * Lógica de negocio compartida del panel de administración.
 * Usada por: api/admin-login.js, api/admin-stats.js (Vercel prod)
 * y src/routes/api.admin-login.ts, src/routes/api.admin-stats.ts (dev local).
 *
 * Flujo de auth: POST /api/admin-login con password -> cookie HttpOnly firmada.
 * GET/POST /api/admin-stats valida la cookie, ya no requiere la contraseña.
 */
import { timingSafeEqual } from "node:crypto";
import {
  createSessionToken,
  isRateLimited,
  registerFailedAttempt,
  isValidSessionToken,
} from "./admin-session.js";

function constantTimeEquals(a, b) {
  const bufA = Buffer.from(a || "");
  const bufB = Buffer.from(b || "");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Contraseñas obvias: son las primeras que prueba cualquiera que conozca el
// proyecto, y el rate limiting no protege contra un diccionario corto.
const CLAVES_PROHIBIDAS = [
  "admin",
  "password",
  "contrasena",
  "123456",
  "eit",
  "eitudp",
  "udp",
  "asistente",
  "chatudp",
  "practicas",
  "titulacion",
];

/**
 * Evalúa la robustez de ADMIN_PASSWORD.
 *
 * Existe porque el rate limiting sirve de poco por sí solo: 5 intentos cada 5
 * minutos son ~1.440 al día, y una clave corta o adivinable cae en menos de una
 * semana. El panel expone las preguntas de los estudiantes, así que no es un
 * secreto trivial.
 *
 * @returns {{ok: true} | {ok: false, motivo: string}}
 */
export function evaluarFortalezaClave(clave) {
  if (typeof clave !== "string" || clave.length === 0) {
    return { ok: false, motivo: "ADMIN_PASSWORD no está configurada" };
  }
  if (clave.length < 12) {
    return { ok: false, motivo: "tiene menos de 12 caracteres" };
  }

  const normalizada = clave.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const prohibida of CLAVES_PROHIBIDAS) {
    if (normalizada === prohibida || normalizada === `${prohibida}2026`) {
      return { ok: false, motivo: "es una palabra obvia del proyecto" };
    }
  }

  const variedad = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
    re.test(clave),
  ).length;
  if (variedad < 3) {
    return {
      ok: false,
      motivo: "no combina al menos tres de: minúsculas, mayúsculas, dígitos y símbolos",
    };
  }

  return { ok: true };
}

function esProduccion() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

// Se avisa una vez por instancia, no en cada intento de login.
let claveDebilAvisada = false;

/**
 * Verifica que una petición al panel venga del propio sitio.
 *
 * SameSite=Lax ya impide que el navegador mande la cookie en un POST cross-site,
 * así que esto es defensa en profundidad: cubre navegadores viejos y cualquier
 * caso en que la cookie viaje igual. Se aplica SOLO a los endpoints de admin —
 * /api/chat debe seguir aceptando peticiones cross-origin porque el widget se
 * embebe legítimamente en páginas de la universidad.
 *
 * @param {string|null} origin - Cabecera Origin.
 * @param {string|null} host - Cabecera Host.
 */
export function origenPermitido(origin, host) {
  // Sin Origin (cliente no navegador, o navegación de primer nivel) no se bloquea:
  // la cookie HttpOnly y el rate limiting siguen siendo la defensa principal.
  if (!origin) return true;

  let hostDelOrigin;
  try {
    hostDelOrigin = new URL(origin).host;
  } catch {
    return false; // Origin malformado.
  }

  if (host && hostDelOrigin === host) return true;

  // Dominios institucionales, para cuando el panel quede bajo *.udp.cl.
  return /(^|\.)udp\.cl$/i.test(hostDelOrigin);
}

/**
 * Procesa el login de admin: valida contraseña con rate limiting por IP/clave.
 * @param {string} password
 * @param {string} rateLimitKey - normalmente la IP del cliente.
 * @returns {{ok: true, token: string} | {ok: false, status: number, error: string}}
 */
export function runAdminLoginHandler(password, rateLimitKey) {
  if (isRateLimited(rateLimitKey)) {
    // Registro de auditoría: una ráfaga de estos con la misma clave es la señal
    // de un intento de fuerza bruta, y sin log no queda rastro de que ocurrió.
    console.warn(`[AUDIT] Login admin bloqueado por rate limit · origen=${rateLimitKey}`);
    return {
      ok: false,
      status: 429,
      error: "Demasiados intentos. Intenta de nuevo en unos minutos.",
    };
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    return { ok: false, status: 500, error: "Panel de administración no configurado." };
  }

  // Fail-closed en producción ante una clave débil. El rate limiting solo encarece
  // la fuerza bruta; no la impide. Preferimos un panel que no abre a un panel que
  // se abre con la primera palabra que alguien adivine.
  const fortaleza = evaluarFortalezaClave(ADMIN_PASSWORD);
  if (!fortaleza.ok) {
    if (esProduccion()) {
      console.error(`[AUDIT] ADMIN_PASSWORD rechazada: ${fortaleza.motivo}`);
      return {
        ok: false,
        status: 500,
        error: "Panel de administración mal configurado. Contacta al administrador.",
      };
    }
    if (!claveDebilAvisada) {
      console.warn(
        `[ADMIN] ADMIN_PASSWORD débil (${fortaleza.motivo}). ` +
          `En producción el panel se negará a abrir hasta cambiarla.`,
      );
      claveDebilAvisada = true;
    }
  }

  if (typeof password !== "string" || !constantTimeEquals(password, ADMIN_PASSWORD)) {
    registerFailedAttempt(rateLimitKey);
    console.warn(`[AUDIT] Login admin fallido · origen=${rateLimitKey}`);
    return { ok: false, status: 401, error: "Contraseña incorrecta." };
  }

  console.warn(`[AUDIT] Login admin exitoso · origen=${rateLimitKey}`);
  const token = createSessionToken();
  return { ok: true, token };
}

/**
 * Valida la cookie de sesión y, si es válida, devuelve las estadísticas agregadas.
 * @param {string | null} sessionToken
 */
export async function runAdminStatsHandler(sessionToken) {
  if (!isValidSessionToken(sessionToken)) {
    return { ok: false, status: 401, error: "Sesión inválida o expirada." };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { ok: false, status: 500, error: "Supabase no está configurado." };
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };

  const [questionsRes, feedbackRes, recentFeedbackRes, generalFeedbackRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/preguntas_log?select=pregunta,con_contexto,created_at&order=created_at.desc&limit=500`,
      { headers, signal: AbortSignal.timeout(8000) },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/feedback?select=pregunta,score,comentario,created_at&order=created_at.desc&limit=300`,
      { headers, signal: AbortSignal.timeout(8000) },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/feedback?select=pregunta,respuesta,comentario,created_at&score=eq.negativo&comentario=neq.&order=created_at.desc&limit=20`,
      { headers, signal: AbortSignal.timeout(8000) },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/satisfaction_feedback?select=rating,comentario,created_at&order=created_at.desc&limit=200`,
      { headers, signal: AbortSignal.timeout(8000) },
    ),
  ]);

  const questions = questionsRes.ok ? await questionsRes.json() : [];
  const feedback = feedbackRes.ok ? await feedbackRes.json() : [];
  const recentNegative = recentFeedbackRes.ok ? await recentFeedbackRes.json() : [];
  const generalFeedback = generalFeedbackRes.ok ? await generalFeedbackRes.json() : [];

  const dailyMap = new Map();
  for (const q of questions) {
    const day = q.created_at?.slice(0, 10) ?? "unknown";
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const dailyUsage = [...dailyMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const questionCounts = new Map();
  for (const q of questions) {
    const normalized = (q.pregunta || "")
      .toLowerCase()
      .trim()
      .replace(/[?!¿¡.,]+$/g, "");
    if (normalized.length > 5) {
      questionCounts.set(normalized, (questionCounts.get(normalized) ?? 0) + 1);
    }
  }
  const topQuestions = [...questionCounts.entries()]
    .map(([question, count]) => ({ question, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const positive = feedback.filter((f) => f.score === "positivo").length;
  const negative = feedback.filter((f) => f.score === "negativo").length;
  const totalFeedback = positive + negative;

  let totalStars = 0;
  const ratingsDistribution = [0, 0, 0, 0, 0];
  for (const gf of generalFeedback) {
    const r = gf.rating;
    if (typeof r === "number" && r >= 1 && r <= 5) {
      totalStars += r;
      ratingsDistribution[r - 1]++;
    }
  }
  const avgGeneralRating =
    generalFeedback.length > 0 ? Number((totalStars / generalFeedback.length).toFixed(1)) : 0;

  const noContextQuestions = questions
    .filter((q) => !q.con_contexto)
    .map((q) => q.pregunta)
    .slice(0, 20);

  return {
    ok: true,
    data: {
      totalQuestions: questions.length,
      dailyUsage,
      topQuestions,
      satisfaction: {
        positive,
        negative,
        total: totalFeedback,
        rate: totalFeedback > 0 ? Math.round((positive / totalFeedback) * 100) : 0,
      },
      coverageGaps: noContextQuestions,
      recentNegativeFeedback: recentNegative,
      generalFeedback: {
        avgRating: avgGeneralRating,
        totalCount: generalFeedback.length,
        distribution: ratingsDistribution,
        comments: generalFeedback.filter((gf) => gf.comentario),
      },
    },
  };
}
