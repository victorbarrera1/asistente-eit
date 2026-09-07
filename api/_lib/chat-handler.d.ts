type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatOutcome = "answered" | "out_of_scope" | "clarification" | "insufficient_evidence";

export function validateChatRequest(
  body: unknown,
): { valid: true; messages: ChatMessage[] } | { valid: false; error: string };
export function isChatRateLimited(rateLimitKey: string): boolean;
export function runChatHandler(
  body: unknown,
  onChunk: (chunk: string) => void,
  rateLimitKey?: string,
): Promise<
  | { ok: true; outcome: ChatOutcome }
  | { ok: false; status: number; error: string; streamStarted?: boolean }
>;
