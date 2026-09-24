/**
 * Endpoint de logout del panel de administración (Vercel Serverless).
 * Invalida la cookie de sesión de admin (Max-Age=0).
 */
import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  parseCookie,
  revokeSessionToken,
} from "./_lib/admin-session.js";
import { origenPermitido } from "./_lib/admin-handler.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Evita que otro sitio cierre la sesión del administrador (CSRF de logout).
  if (!origenPermitido(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: "Origen no permitido." });
  }

  // Invalida la sesión también en el servidor, no solo en el navegador.
  revokeSessionToken(parseCookie(req.headers.cookie, SESSION_COOKIE_NAME));
  res.setHeader("Set-Cookie", buildClearSessionCookie(req));
  return res.status(200).json({ success: true });
}
