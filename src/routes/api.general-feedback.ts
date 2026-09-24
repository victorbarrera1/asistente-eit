import { createFileRoute } from "@tanstack/react-router";
import { runGeneralFeedbackHandler } from "../../api/_lib/feedback-handler.js";
import { getClientKey } from "../../api/_lib/rate-limit.js";
import { readJsonBody } from "../../api/_lib/http-body.js";

export const Route = createFileRoute("/api/general-feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = await readJsonBody(request);
        if (!parsed.ok) {
          return Response.json({ error: parsed.error }, { status: parsed.status });
        }

        const result = await runGeneralFeedbackHandler(parsed.body, getClientKey(request));
        if (!result.ok) {
          return Response.json({ error: result.error }, { status: result.status });
        }
        return Response.json({ success: true });
      },
    },
  },
});
