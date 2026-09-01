import { createFileRoute } from "@tanstack/react-router";
import { buildClearSessionCookie } from "../../api/_lib/admin-session.js";

export const Route = createFileRoute("/api/admin-logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildClearSessionCookie(request),
          },
        });
      },
    },
  },
});
