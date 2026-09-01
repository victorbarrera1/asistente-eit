/**
 * Endpoint de chat en producción (Vercel Serverless).
 * Hace RAG sobre Supabase y responde en streaming (texto plano).
 * La lógica de negocio vive en _lib/chat-handler.js (compartida con dev local).
 */
import { runChatHandler } from "./_lib/chat-handler.js";
import { getClientKey } from "./_lib/rate-limit.js";

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  let headersFlushed = false;
  const result = await runChatHandler(
    req.body,
    (chunk) => {
      headersFlushed = true;
      res.write(chunk);
    },
    getClientKey(req),
  );

  if (!result.ok) {
    if (!headersFlushed) {
      return res.status(result.status).json({ error: result.error });
    }
    // El stream ya empezó a enviarse: anexamos el error al texto.
    res.write(`\n\n⚠️ ${result.error}`);
  }

  res.end();
}
