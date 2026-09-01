import { createFileRoute } from "@tanstack/react-router";

// Núcleo de negocio compartido con el endpoint de producción (api/chat.js).
// Este handler sirve /api/chat en desarrollo local (vite dev).
import {
  runChatHandler,
  validateChatRequest,
  isChatRateLimited,
} from "../../api/_lib/chat-handler.js";
import { getClientKey } from "../../api/_lib/rate-limit.js";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rateLimitKey = getClientKey(request);

        // Pre-chequeo síncrono de rate limit, para poder devolver 429 antes de
        // comprometerse a abrir el stream de respuesta.
        if (isChatRateLimited(rateLimitKey)) {
          return Response.json(
            { error: "Demasiados mensajes en poco tiempo. Espera un momento e intenta de nuevo." },
            { status: 429 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
        }

        // Pre-chequeo síncrono (mismas reglas que runChatHandler) para poder
        // devolver un status de error correcto antes de abrir el stream de respuesta.
        const validation = validateChatRequest(body as Record<string, unknown>);
        if (!validation.valid) {
          return Response.json({ error: validation.error }, { status: 400 });
        }
        // Ya no hay pre-chequeo de credencial: Ollama no usa API key. Si el servidor de IA local no
        // responde, runChatHandler lanza y el error se reporta abajo según si el
        // stream alcanzó a emitir algo.

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const result = await runChatHandler(
              body,
              (chunk: string) => {
                controller.enqueue(encoder.encode(chunk));
              },
              rateLimitKey,
            );
            if (!result.ok && result.streamStarted) {
              controller.enqueue(encoder.encode(`\n\n⚠️ ${result.error}`));
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
