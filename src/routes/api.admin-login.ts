import { createFileRoute } from "@tanstack/react-router";
import { runAdminLoginHandler, origenPermitido } from "../../api/_lib/admin-handler.js";
import { buildSessionCookie } from "../../api/_lib/admin-session.js";
import { getClientKey } from "../../api/_lib/rate-limit.js";

export const Route = createFileRoute("/api/admin-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!origenPermitido(request.headers.get("origin"), request.headers.get("host"))) {
          return Response.json({ error: "Origen no permitido." }, { status: 403 });
        }

        let body: { password?: string };
        try {
          body = (await request.json()) as { password?: string };
        } catch {
          return Response.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
        }

        // Misma corrección que en api/admin-login.js: x-forwarded-for lo controla
        // el cliente, así que derivar la clave de ahí permitía intentos ilimitados
        // contra la contraseña de admin rotando el header.
        const rateLimitKey = getClientKey(request);
        const result = runAdminLoginHandler(body.password, rateLimitKey);
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
