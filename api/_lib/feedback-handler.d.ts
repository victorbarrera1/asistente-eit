type HandlerResult = { ok: true } | { ok: false; status: number; error: string };

export function runFeedbackHandler(body: unknown, rateLimitKey?: string): Promise<HandlerResult>;
export function runGeneralFeedbackHandler(
  body: unknown,
  rateLimitKey?: string,
): Promise<HandlerResult>;
