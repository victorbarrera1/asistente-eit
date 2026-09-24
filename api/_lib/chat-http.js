import { runChatHandler, isChatRateLimited } from "./chat-handler.js";
import { getClientKey } from "./rate-limit.js";
import { readJsonBody } from "./http-body.js";

/** Adaptador Fetch: no compromete HTTP 200 antes de conocer el resultado. */
export async function handleChatRequest(request) {
  const rateLimitKey = getClientKey(request);
  if (isChatRateLimited(rateLimitKey)) {
    return Response.json({ error: "Demasiados mensajes en poco tiempo. Espera un momento e intenta de nuevo." }, { status: 429 });
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  let reply = "";
  const result = await runChatHandler(parsed.body, (text) => { reply = text; }, rateLimitKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return new Response(reply, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Chat-Outcome": result.outcome,
    },
  });
}
