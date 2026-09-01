/**
 * Autorización compartida del endpoint de re-scraping.
 * Usada por: api/cron-scrape.js (Vercel prod) y src/routes/api.cron-scrape.ts (dev / Dokku).
 *
 * Antes cada adaptador comparaba el header con `authHeader !== \`Bearer ${secret}\``.
 * Eso tiene dos problemas: la comparación de strings de JS corta en el primer byte
 * distinto (filtra el secreto por tiempo de respuesta) y el endpoint no tenía ningún
 * límite de intentos, así que se podía sondear indefinidamente.
 */
import { timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "./rate-limit.js";

// El cron legítimo corre una vez al día. 10 intentos cada 15 minutos es holgado
// para reintentos y operación manual, y cierra el sondeo automatizado.
const cronLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 10 });

/**
 * Compara dos strings en tiempo constante, sin filtrar su longitud por la vía
 * de retornar antes de tiempo.
 */
function constantTimeEquals(a, b) {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length) {
    // Se compara igual contra sí mismo para no acortar el tiempo de respuesta
    // cuando las longitudes difieren.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Valida la autorización del cron.
 *
 * @param {string | null | undefined} authHeader - Header Authorization crudo.
 * @param {string} rateLimitKey - Clave de rate limiting (IP resuelta por getClientKey).
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function authorizeCronRequest(authHeader, rateLimitKey = "unknown") {
  if (cronLimiter.isLimited(rateLimitKey)) {
    return { ok: false, status: 429, error: "Too Many Requests" };
  }

  // Fail-closed: sin CRON_SECRET configurado no se ejecuta ninguna ingesta.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[CRON] CRON_SECRET no está configurado. Rechazando ejecución (fail-closed).");
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  if (!constantTimeEquals(authHeader, `Bearer ${secret}`)) {
    cronLimiter.register(rateLimitKey);
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
