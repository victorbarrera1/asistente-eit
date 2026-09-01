/**
 * Sesión de administrador basada en cookie HttpOnly firmada (HMAC-SHA256).
 * Evita enviar la contraseña en cada request: tras un login exitoso se emite
 * una cookie de sesión firmada con expiración, que se valida en cada llamada
 * a /api/admin-stats sin volver a tocar la contraseña ni Supabase.
 *
 * No agrega dependencias nuevas: usa node:crypto (disponible en Vercel Functions).
 */
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { createRateLimiter } from "./rate-limit.js";

export const SESSION_COOKIE_NAME = "eit_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// Evita repetir el warning de fallback en cada request (una vez por instancia basta).
let warnedFallbackSecret = false;

function isProductionEnv() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function getSessionSecret() {
  const dedicated = (process.env.ADMIN_SESSION_SECRET || "").trim();
  if (dedicated) return dedicated;

  if (isProductionEnv()) {
    // Fail-closed en producción: no reutilizar ADMIN_PASSWORD como firma.
    // ADMIN_PASSWORD está pensado para ser memorizado por una persona, no como
    // material criptográfico, y si se rota la contraseña las sesiones firmadas
    // con la firma anterior seguirían siendo válidas hasta expirar.
    throw new Error(
      "ADMIN_SESSION_SECRET es obligatorio en producción para firmar la sesión de admin.",
    );
  }

  // Fallback solo en desarrollo local, para no bloquear el flujo si no se
  // configuró un secreto dedicado.
  const fallback = (process.env.ADMIN_PASSWORD || "").trim();
  if (!fallback) {
    // Fail-closed: nunca firmar con una clave vacía (sería falsificable por cualquiera).
    throw new Error(
      "No hay secreto configurado para firmar la sesión de admin (ADMIN_SESSION_SECRET o ADMIN_PASSWORD).",
    );
  }
  if (!warnedFallbackSecret) {
    console.warn(
      "[ADMIN] Usando ADMIN_PASSWORD como firma de sesión (solo válido en dev). " +
        "Configura ADMIN_SESSION_SECRET antes de desplegar a producción.",
    );
    warnedFallbackSecret = true;
  }
  return fallback;
}

function sign(payload) {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Crea el valor de una cookie de sesión de admin firmada.
 * Formato: <expiresAtMs>.<nonce>.<signature>
 */
/**
 * Corta las sesiones emitidas antes de una fecha dada.
 *
 * Hasta ahora una cookie robada seguía siendo válida sus 8 horas completas, sin
 * ninguna forma de invalidarla salvo rotar ADMIN_SESSION_SECRET (que exige
 * redesplegar). Con SESSION_NOT_BEFORE se marca un corte: toda sesión emitida
 * antes de ese instante queda inválida de inmediato.
 *
 * Uso ante una sospecha de robo: fijar la variable a la fecha actual en formato
 * ISO y reiniciar. Las sesiones legítimas simplemente vuelven a autenticarse.
 */
function emitidaAntesDelCorte(expiresAt) {
  const corte = process.env.SESSION_NOT_BEFORE;
  if (!corte) return false;

  const corteMs = Date.parse(corte);
  if (!Number.isFinite(corteMs)) return false;

  // expiresAt = emisión + TTL, así que la emisión se reconstruye restando el TTL.
  return expiresAt - SESSION_TTL_MS < corteMs;
}

export function createSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonce = randomUUID();
  const payload = `${expiresAt}.${nonce}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/**
 * Valida un token de sesión. Devuelve true si la firma es correcta y no ha expirado.
 * Cualquier error (incluido un secreto de firma no configurado) se trata como
 * sesión inválida, nunca como una excepción sin controlar.
 */
export function isValidSessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresAtStr, nonce, signature] = parts;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  // Revocación masiva: permite invalidar sesiones ya emitidas sin rotar el secreto.
  if (emitidaAntesDelCorte(expiresAt)) return false;

  try {
    const expectedSignature = sign(`${expiresAtStr}.${nonce}`);
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Determina si la cookie debe marcarse como Secure (solo enviada sobre HTTPS).
 * En conexiones HTTP (como túneles locales, dev o http:// IP privada), los navegadores
 * descartan silenciosamente cookies marcadas con Secure. Solo se activa si la petición es HTTPS.
 */
function isSecureRequest(reqOrRequest) {
  if (!reqOrRequest) {
    return process.env.VERCEL_ENV === "production";
  }
  if (typeof reqOrRequest.headers?.get === "function") {
    const proto = reqOrRequest.headers.get("x-forwarded-proto");
    if (proto === "https") return true;
    if (proto === "http") return false;
    return Boolean(reqOrRequest.url?.startsWith("https://"));
  }
  const proto = reqOrRequest.headers?.["x-forwarded-proto"];
  if (proto === "https") return true;
  if (proto === "http") return false;
  return process.env.VERCEL_ENV === "production";
}

/**
 * Construye el header Set-Cookie para la sesión (login).
 */
export function buildSessionCookie(token, reqOrRequest) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isSecureRequest(reqOrRequest);
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (secure) attrs.splice(2, 0, "Secure");
  return attrs.join("; ");
}

/**
 * Construye el header Set-Cookie para cerrar sesión (logout).
 */
export function buildClearSessionCookie(reqOrRequest) {
  const secure = isSecureRequest(reqOrRequest);
  const attrs = [`${SESSION_COOKIE_NAME}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) attrs.splice(2, 0, "Secure");
  return attrs.join("; ");
}

/**
 * Extrae el valor de una cookie por nombre desde el header Cookie crudo.
 */
export function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// ─── Rate limiting del login de admin (5 intentos / 5 min por IP) ──────────
const loginLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxAttempts: 5 });

export function isRateLimited(key) {
  return loginLimiter.isLimited(key);
}

export function registerFailedAttempt(key) {
  loginLimiter.register(key);
}
