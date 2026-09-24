import { createFileRoute } from "@tanstack/react-router";
import { runAdminLoginHandler, origenPermitido } from "../../api/_lib/admin-handler.js";
import { buildSessionCookie } from "../../api/_lib/admin-session.js";
import { getClientKey } from "../../api/_lib/rate-limit.js";
import { readJsonBody } from "../../api/_lib/http-body.js";

export const Route = createFileRoute("/api/admin-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!origenPermitido(request.headers.get("origin"), request.headers.get("host"))) {
          return Response.json({ error: "Origen no permitido." }, { status: 403 });
        }

        // Un cuerpo JSON `null` antes hacía fallar `body.password` con un 500.
        const parsed = await readJsonBody(request);
        if (!parsed.ok) {
          return Response.json({ error: parsed.error }, { status: parsed.status });
        }

        // Misma corrección que en api/admin-login.js: x-forwarded-for lo controla
        // el cliente, así que derivar la clave de ahí permitía intentos ilimitados
        // contra la contraseña de admin rotando el header.
        const rateLimitKey = getClientKey(request);
        const result = runAdminLoginHandler(parsed.body.password, rateLimitKey);
        if (!result.ok) {
          return Response.json({ error: result.error }, { status: result.status });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildSessionCookie(result.token, request),
          },
        });
      },
    },
  },
});
