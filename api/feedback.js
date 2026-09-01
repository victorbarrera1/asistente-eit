/**
 * Endpoint de feedback de respuestas del chat (👍/👎) en producción (Vercel).
 * La lógica de negocio vive en _lib/feedback-handler.js (compartida con dev local).
 */
import { runFeedbackHandler } from "./_lib/feedback-handler.js";
import { getClientKey } from "./_lib/rate-limit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const result = await runFeedbackHandler(req.body, getClientKey(req));
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(200).json({ success: true });
}
