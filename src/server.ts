import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

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
const MAX_BODY_BYTES = 128 * 1024;

function excedeTamanoMaximo(request: Request): boolean {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return false;

  const declarado = Number(request.headers.get("content-length"));
  return Number.isFinite(declarado) && declarado > MAX_BODY_BYTES;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    if (excedeTamanoMaximo(request)) {
      return Response.json({ error: "La petición es demasiado grande." }, { status: 413 });
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withApiSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
