export function authorizeCronRequest(
  authHeader: string | null | undefined,
  rateLimitKey?: string,
): { ok: true } | { ok: false; status: number; error: string };
