import { createFileRoute } from "@tanstack/react-router";
import { runAdminStatsHandler } from "../../api/_lib/admin-handler.js";
import { SESSION_COOKIE_NAME, parseCookie } from "../../api/_lib/admin-session.js";

export const Route = createFileRoute("/api/admin-stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionToken = parseCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
        const result = await runAdminStatsHandler(sessionToken);
        if (!result.ok) {
          return Response.json({ error: result.error }, { status: result.status });
        }
        return Response.json(result.data);
      },
    },
  },
});
