/**
 * Endpoint de estadísticas del panel de administración (Vercel Serverless).
 * Antes solo existía en dev local (src/routes/api.admin-stats.ts); faltaba
 * el equivalente de producción, por lo que el panel /admin no funcionaba en Vercel.
 *
 * Protegido por cookie de sesión HttpOnly (ver /api/admin-login), no por
 * contraseña en cada request.
 */
import { runAdminStatsHandler } from "./_lib/admin-handler.js";
import { SESSION_COOKIE_NAME, parseCookie } from "./_lib/admin-session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionToken = parseCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  const result = await runAdminStatsHandler(sessionToken);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(200).json(result.data);
}
