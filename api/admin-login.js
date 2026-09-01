/**
 * Endpoint de login del panel de administración (Vercel Serverless).
 * Valida la contraseña (con rate limiting) y, si es correcta, emite una
 * cookie de sesión HttpOnly firmada. El cliente deja de enviar la contraseña
 * en cada request a /api/admin-stats.
 */
import { runAdminLoginHandler, origenPermitido } from "./_lib/admin-handler.js";
import { buildSessionCookie } from "./_lib/admin-session.js";
import { getClientKey } from "./_lib/rate-limit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Defensa en profundidad contra CSRF, además de SameSite=Lax.
  if (!origenPermitido(req.headers.origin, req.headers.host)) {
    console.warn(`[AUDIT] Login admin con Origin no permitido: ${req.headers.origin}`);
    return res.status(403).json({ error: "Origen no permitido." });
  }

  const { password } = req.body || {};

  // La clave de rate limiting DEBE salir de getClientKey(): antes se derivaba
  // aquí del primer valor de x-forwarded-for, que lo controla el cliente, así
  // que bastaba rotar ese header para tener intentos ilimitados contra la
  // contraseña de admin. Este es el endpoint donde un bypass duele más.
  const rateLimitKey = getClientKey(req);

  const result = runAdminLoginHandler(password, rateLimitKey);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  res.setHeader("Set-Cookie", buildSessionCookie(result.token, req));
  return res.status(200).json({ success: true });
}
