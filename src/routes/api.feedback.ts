import { createFileRoute } from "@tanstack/react-router";
import { runFeedbackHandler } from "../../api/_lib/feedback-handler.js";
import { getClientKey } from "../../api/_lib/rate-limit.js";

export const Route = createFileRoute("/api/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
        }

        const result = await runFeedbackHandler(body, getClientKey(request));
        if (!result.ok) {
          return Response.json({ error: result.error }, { status: result.status });
        }
        return Response.json({ success: true });
      },
    },
  },
});
