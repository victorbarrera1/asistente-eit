import { createFileRoute } from "@tanstack/react-router";
import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  parseCookie,
  revokeSessionToken,
} from "../../api/_lib/admin-session.js";
import { origenPermitido } from "../../api/_lib/admin-handler.js";

export const Route = createFileRoute("/api/admin-logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Evita que otro sitio cierre la sesión del administrador (CSRF de logout).
        if (!origenPermitido(request.headers.get("origin"), request.headers.get("host"))) {
          return Response.json({ error: "Origen no permitido." }, { status: 403 });
        }
        // Invalida la sesión también en el servidor, no solo en el navegador.
        revokeSessionToken(parseCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME));
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
