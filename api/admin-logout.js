/**
 * Endpoint de logout del panel de administración (Vercel Serverless).
 * Invalida la cookie de sesión de admin (Max-Age=0).
 */
import { buildClearSessionCookie } from "./_lib/admin-session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", buildClearSessionCookie(req));
  return res.status(200).json({ success: true });
}
