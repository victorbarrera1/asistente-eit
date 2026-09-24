/**
 * Rate limiting en memoria con resolución segura de IP y protección contra fugas de memoria.
 *
 * Previene evasión por inyección de headers no confiables y protege contra
 * ataques DoS dirigidos a la GPU de inferencia o a la memoria del servidor.
 */
import { BlockList, isIP } from "node:net";
import { getRequestContext } from "./request-context.js";

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
      // Tabla llena incluso tras purgar: antes se dejaba de registrar claves
      // nuevas, y una clave sin registro nunca queda limitada. Llenar la tabla
      // desactivaba el rate limiting para todos (fail-open). Ahora se desaloja
      // la entrada más antigua (los Map conservan el orden de inserción).
      if (attempts.size >= MAX_MAP_ENTRIES) {
        attempts.delete(attempts.keys().next().value);
      }
      attempts.set(key, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
  }

  return { isLimited, register };
}

/**
 * Resolución de la IP del cliente para rate limiting.
 *
 * Regla: la IP del socket manda. Una cabecera de proxy (X-Forwarded-For o la que
 * se declare en TRUSTED_IP_HEADER) solo se acepta cuando la conexión viene de un
 * proxy de confianza. Antes se aceptaba X-Real-IP de cualquiera: en Dokku, Nginx
 * no la reescribe por defecto, así que rotarla daba intentos ilimitados contra
 * /api/admin-login y cupo ilimitado contra la GPU. Se verificó con curl.
 *
 * Variables:
 *   TRUSTED_PROXY_CIDRS  Redes desde donde se aceptan cabeceras de proxy.
 *                        Por defecto loopback y redes privadas (Nginx de Dokku
 *                        conecta desde la red de Docker). "none" las desactiva.
 *   TRUSTED_PROXY_HOPS   Proxies de confianza encadenados delante de la app (1).
 *                        Con un balanceador de la universidad delante de Nginx: 2.
 *   TRUSTED_IP_HEADER    Cabecera alternativa que el proxy de confianza SIEMPRE
 *                        reescribe (ej. x-real-ip si Nginx hace
 *                        `proxy_set_header X-Real-IP $remote_addr`).
 */

const DEFAULT_TRUSTED_PROXY_CIDRS = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "::1/128",
  "fc00::/7",
];

let cachedProxyConfig;
let cachedProxyList;

function trustedProxies() {
  const raw = process.env.TRUSTED_PROXY_CIDRS ?? "";
  if (cachedProxyConfig === raw && cachedProxyList) return cachedProxyList;

  const list = new BlockList();
  const cidrs = raw.trim() ? raw.split(",") : DEFAULT_TRUSTED_PROXY_CIDRS;
  for (const entry of cidrs) {
    const cidr = entry.trim();
    if (!cidr || cidr === "none") continue;
    const [address, prefix] = cidr.split("/");
    const type = isIP(address) === 6 ? "ipv6" : "ipv4";
    if (!isIP(address)) continue;
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
  }
  cachedProxyConfig = raw;
  cachedProxyList = list;
  return list;
}

/** Quita el prefijo IPv4-mapped (::ffff:1.2.3.4) y valida el formato. */
export function normalizeIp(value) {
  if (typeof value !== "string") return null;
  let ip = value.trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

function expandIpv6(ip) {
  const [head, tail = ""] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? Array(8 - a.length - b.length).fill("0") : [];
  return [...a, ...fill, ...b].map((h) => h.padStart(4, "0").toLowerCase());
}

/**
 * Clave de rate limiting para una IP. Una IPv6 se agrupa por su /64: un
 * cliente suele controlar un /64 completo y podría rotar direcciones dentro de él.
 */
export function rateLimitKeyForIp(ip) {
  if (isIP(ip) !== 6) return ip;
  const groups = expandIpv6(ip);
  // Solo las direcciones globales (2000::/3) se agrupan; loopback y locales no.
  const global = (parseInt(groups[0], 16) & 0xe000) === 0x2000;
  return global ? `${groups.slice(0, 4).join(":")}::/64` : ip;
}

function isTrustedProxy(ip) {
  if (!ip) return false;
  return trustedProxies().check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
}

function headerGetter(reqOrRequest) {
  return (name) => {
    if (typeof reqOrRequest.headers?.get === "function") {
      return reqOrRequest.headers.get(name) || undefined;
    }
    const val = reqOrRequest.headers?.[name.toLowerCase()];
    return typeof val === "string" ? val : undefined;
  };
}

/** IP del socket: srvx (request.ip), Node (socket.remoteAddress) o el contexto de server.ts. */
function peerAddress(reqOrRequest) {
  const direct =
    (typeof reqOrRequest.ip === "string" && reqOrRequest.ip) ||
    reqOrRequest.socket?.remoteAddress ||
    getRequestContext()?.peerIp;
  return normalizeIp(direct);
}

/**
 * Entrada de X-Forwarded-For agregada por el proxy de confianza más lejano.
 * Cada proxy agrega la IP que vio al final; las primeras las escribe el cliente.
 */
function forwardedClient(headerValue, hops) {
  if (!headerValue) return null;
  const parts = headerValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < hops) return null;
  return normalizeIp(parts[parts.length - hops]);
}

let warnedUnknownPeer = false;

/**
 * @param {Request | import("node:http").IncomingMessage | null | undefined} reqOrRequest
 * @returns {string} Clave estable por cliente (IPv4, prefijo IPv6 /64 o "unknown").
 */
export function getClientKey(reqOrRequest) {
  if (!reqOrRequest) return "unknown";
  const getHeader = headerGetter(reqOrRequest);

  // Vercel reescribe x-vercel-forwarded-for en su borde; el cliente no puede fijarlo.
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    const vercelIp = forwardedClient(getHeader("x-vercel-forwarded-for"), 1);
    if (vercelIp) return rateLimitKeyForIp(vercelIp);
  }

  const peer = peerAddress(reqOrRequest);
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);

  if (peer && isTrustedProxy(peer)) {
    const custom = process.env.TRUSTED_IP_HEADER?.trim();
    const fromProxy = custom
      ? forwardedClient(getHeader(custom), 1)
      : forwardedClient(getHeader("x-forwarded-for"), hops);
    // Si el proxy no envió la cabecera, la conexión es local (dev, healthcheck).
    return rateLimitKeyForIp(fromProxy ?? peer);
  }

  // Conexión directa desde fuera de la red de confianza: las cabeceras son del
  // cliente y se ignoran por completo.
  if (peer) return rateLimitKeyForIp(peer);

  // Sin IP de socket no hay forma de validar cabeceras. Un balde compartido es
  // preferible a una clave que el atacante elige.
  if (!warnedUnknownPeer) {
    console.warn(
      "[RATE-LIMIT] No se pudo determinar la IP del socket; se usa una clave compartida.",
    );
    warnedUnknownPeer = true;
  }
  return "unknown";
}
