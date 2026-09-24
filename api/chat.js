/**
 * Endpoint de chat en producción (Vercel Serverless).
 * Hace RAG sobre Supabase y responde con texto plano validado.
 * La lógica de negocio vive en _lib/chat-handler.js (compartida con dev local).
 */
import { runChatHandler } from "./_lib/chat-handler.js";
import { getClientKey } from "./_lib/rate-limit.js";
import { validateParsedJsonBody } from "./_lib/http-body.js";

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const parsed = validateParsedJsonBody(req);
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });

  // El handler valida toda la respuesta antes de publicarla. Esperar el resultado
  // permite devolver el mismo estado HTTP que el adaptador TanStack.
  let reply = "";
  const result = await runChatHandler(parsed.body, (text) => { reply = text; }, getClientKey(req));
  res.setHeader("Cache-Control", "no-store");
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Chat-Outcome", result.outcome);
  res.end(reply);
}
