import "./lib/error-capture";

import { randomBytes } from "node:crypto";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getRequestContext, runWithRequestContext } from "../api/_lib/request-context.js";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Cabeceras de seguridad para las respuestas de /api/*.
 *
 * Los routeRules de Nitro (vite.config.ts) solo se aplican a las rutas de página
 * servidas por Nitro; los handlers de API de TanStack Start se resuelven dentro
 * del fetch de la app y quedan fuera de esa capa. Se verificó con curl: /api/*
 * salía sin ninguna cabecera de seguridad, pese al comentario del baseline.
 *
 * En Vercel estas rutas las sirven las funciones de api/*.js, que tampoco pasan
 * por acá; ese lado se cubre con el bloque "headers" de vercel.json.
 */
function withApiSecurityHeaders(response: Response, request: Request): Response {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Las respuestas de la API nunca deben quedar en caché de proxies ni del
  // navegador: /api/admin-stats devuelve las métricas del panel.
  headers.set("Cache-Control", "no-store, max-age=0");
  // La API solo devuelve JSON o texto plano: no debe cargar recursos, ejecutar
  // nada ni poder incrustarse en un iframe si alguien la abre directamente.
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Resource-Policy", "same-site");

  // Se reenvía response.body sin tocarlo para no romper el streaming de /api/chat.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Tope de tamaño del cuerpo de las peticiones a /api/*.
 *
 * Los handlers hacen `await request.json()`, que bufferea el cuerpo completo en
 * memoria antes de que corra ninguna validación. En Vercel la plataforma corta en
 * ~4,5 MB, pero el despliegue de Dokku no tiene ningún tope: un POST de cientos de
 * megabytes tumbaría el proceso antes de llegar al rate limiting.
 *
 * 128 KB es holgado para el uso real: el chat admite 12 mensajes de 3.000
 * caracteres, o sea ~36 KB de texto, y el feedback bastante menos.
 */
// Debe coincidir con MAX_JSON_BODY_BYTES de api/_lib/http-body.js, que además
// cuenta los bytes reales cuando la petición no declara Content-Length.
const MAX_BODY_BYTES = 128 * 1024;

function excedeTamanoMaximo(request: Request): boolean {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return false;

  const declarado = Number(request.headers.get("content-length"));
  return Number.isFinite(declarado) && declarado > MAX_BODY_BYTES;
}

/**
 * Redirección HTTP → HTTPS detrás del proxy (Dokku/Nginx).
 *
 * Es opt-in con FORCE_HTTPS=true porque depende de cómo esté armada la cadena de
 * proxies: si el TLS lo termina un proxy de la universidad ANTES de Nginx y ese
 * Nginx reenvía `X-Forwarded-Proto: http`, redirigir sin mirar causaría un bucle
 * infinito. Activarlo solo tras verificar que el proxy que termina TLS fija el
 * header (en Dokku: `dokku nginx:show-config <app>`).
 */
function redireccionHttps(request: Request): Response | null {
  if (process.env.FORCE_HTTPS !== "true") return null;
  if (request.headers.get("x-forwarded-proto") !== "http") return null;

  const url = new URL(request.url);
  url.protocol = "https:";
  url.port = "";
  // 308 conserva el método y el cuerpo: un POST no se convierte en GET.
  return new Response(null, { status: 308, headers: { Location: url.toString() } });
}

/**
 * Content-Security-Policy de las páginas HTML, con nonce por petición.
 *
 * La CSP anterior no tenía script-src: un XSS (por ejemplo, una respuesta del
 * modelo que se colara al DOM) podía ejecutar cualquier script inline o
 * exfiltrar la conversación a otro dominio. Ahora solo corren los scripts del
 * propio origen y los inline que TanStack emite con este nonce (router.tsx lo
 * pasa a `ssr.nonce`), y el navegador solo puede conectarse al propio origen.
 *
 * style-src conserva 'unsafe-inline' porque React emite atributos style; es de
 * bajo riesgo comparado con scripts. En dev no se aplica: Vite inyecta scripts
 * inline sin nonce para el hot reload.
 */
function frameAncestors(pathname: string): string {
  return pathname.startsWith("/widget") ? "'self' https://*.udp.cl" : "'none'";
}

// En dev solo se aplican las directivas que no rompen el hot reload de Vite.
function devPageCsp(pathname: string): string {
  return `object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${frameAncestors(pathname)}`;
}

function pageCsp(nonce: string, pathname: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors(pathname)}`,
  ].join("; ");
}

function withPageCsp(response: Response, request: Request, nonce: string): Response {
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;

  const { pathname } = new URL(request.url);
  const headers = new Headers(response.headers);
  if (import.meta.env.PROD) {
    headers.set("Content-Security-Policy", pageCsp(nonce, pathname));
    // Un HTML con nonce no debe reutilizarse desde una caché compartida: el nonce
    // quedaría fijo y predecible.
    headers.set("Cache-Control", "no-store");
  } else {
    headers.set("Content-Security-Policy", devPageCsp(pathname));
  }
  // Toda página (incluida la de 404) sin iframe ajeno, salvo el widget.
  if (!pathname.startsWith("/widget")) headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// router.tsx es isomórfico y no puede importar node:async_hooks; lee el nonce
// de la petición en curso a través de este getter, que solo existe en el servidor.
(globalThis as { __EIT_CSP_NONCE__?: () => string | undefined }).__EIT_CSP_NONCE__ = () =>
  getRequestContext()?.cspNonce;

/** IP del socket según srvx (Nitro node-server); se pierde si el Request se clona. */
function socketIp(request: Request): string | undefined {
  const ip = (request as Request & { ip?: unknown }).ip;
  return typeof ip === "string" ? ip : undefined;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const redireccion = redireccionHttps(request);
    if (redireccion) return redireccion;

    if (excedeTamanoMaximo(request)) {
      return Response.json({ error: "La petición es demasiado grande." }, { status: 413 });
    }

    const cspNonce = randomBytes(16).toString("base64");
    return runWithRequestContext({ peerIp: socketIp(request), cspNonce }, () =>
      handle(request, env, ctx, cspNonce),
    );
  },
};

async function handle(request: Request, env: unknown, ctx: unknown, cspNonce: string) {
  try {
    const handler = await getServerEntry();
    const response = await handler.fetch(request, env, ctx);
    const normalized = await normalizeCatastrophicSsrResponse(response);
    return withPageCsp(withApiSecurityHeaders(normalized, request), request, cspNonce);
  } catch (error) {
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}
