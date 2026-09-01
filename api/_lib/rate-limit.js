/**
 * Rate limiting en memoria con resolución segura de IP y protección contra fugas de memoria.
 *
 * Previene evasión por inyección de headers no confiables y protege contra
 * ataques DoS dirigidos a la GPU de inferencia o a la memoria del servidor.
 */

const MAX_MAP_ENTRIES = 10000;

export function createRateLimiter({ windowMs, maxAttempts }) {
  const attempts = new Map();
  let opsSinceLastCleanup = 0;

  function cleanupExpired(now) {
    for (const [key, entry] of attempts.entries()) {
      if (now - entry.windowStart > windowMs) {
        attempts.delete(key);
      }
    }
  }

  function getActiveEntry(key) {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry) return null;
    if (now - entry.windowStart > windowMs) {
      attempts.delete(key);
      return null;
    }
    return entry;
  }

  function isLimited(key) {
    const entry = getActiveEntry(key);
    return Boolean(entry && entry.count >= maxAttempts);
  }

  function register(key) {
    const now = Date.now();

    // Purga periódica cada 100 operaciones para liberar memoria en Dokku
    opsSinceLastCleanup++;
    if (opsSinceLastCleanup >= 100 || attempts.size >= MAX_MAP_ENTRIES) {
      cleanupExpired(now);
      opsSinceLastCleanup = 0;

      // Si aún excede el límite máximo tras purgar expirados, eliminar solo
      // las entradas que están a más del 80% de su ciclo de vida (no activas)
      if (attempts.size >= MAX_MAP_ENTRIES) {
        const threshold = now - windowMs * 0.8;
        for (const [k, v] of attempts.entries()) {
          if (v.windowStart < threshold) {
            attempts.delete(k);
          }
        }
      }
    }

    const entry = getActiveEntry(key);
    if (!entry) {
      // Si la tabla sigue llena por un ataque masivo, rechazar nuevas asignaciones
      if (attempts.size < MAX_MAP_ENTRIES) {
        attempts.set(key, { count: 1, windowStart: now });
      }
    } else {
      entry.count += 1;
    }
  }

  return { isLimited, register };
}

/**
 * Extrae la IP del cliente usando únicamente headers confiables asignados
 * por la plataforma de hosting (x-vercel-forwarded-for en Vercel, x-real-ip en Dokku/Nginx)
 * o configurados explícitamente vía TRUSTED_IP_HEADER.
 */
export function getClientKey(reqOrRequest) {
  if (!reqOrRequest) return "unknown";

  const getHeader = (name) => {
    if (typeof reqOrRequest.headers?.get === "function") {
      return reqOrRequest.headers.get(name) || undefined;
    }
    const val = reqOrRequest.headers?.[name.toLowerCase()];
    return typeof val === "string" ? val : undefined;
  };

  // 1. Header configurado explícitamente en variables de entorno (máxima prioridad)
  const customHeader = process.env.TRUSTED_IP_HEADER;
  if (customHeader) {
    const ip = getHeader(customHeader)?.trim();
    if (ip) return ip;
  }

  // 2. Entorno Vercel: Vercel sanea y provee x-vercel-forwarded-for en su edge
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  if (isVercel) {
    const vercelIp = getHeader("x-vercel-forwarded-for")?.trim();
    if (vercelIp) return vercelIp;
  }

  // 3. Entorno Dokku / Nginx: Nginx asigna X-Real-IP con la IP remota directa ($remote_addr)
  const realIp = getHeader("x-real-ip")?.trim();
  if (realIp) return realIp;

  // 4. Fallback a X-Forwarded-For: tomar el último salto (agregado por el proxy de confianza)
  const forwarded = getHeader("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const trustedEdgeHop = parts[parts.length - 1] || parts[0];
    if (trustedEdgeHop) return trustedEdgeHop;
  }

  // 5. Fallback a socket directo en Node local
  return reqOrRequest.socket?.remoteAddress || "unknown";
}
