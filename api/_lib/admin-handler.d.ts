// Contratos usados por las rutas TanStack; la implementación permanece en JavaScript.
type HandlerError = { ok: false; status: number; error: string };

export function origenPermitido(origin: string | null, host: string | null): boolean;
export function runAdminLoginHandler(
  password: unknown,
  rateLimitKey: string,
): { ok: true; token: string } | HandlerError;
export function runAdminStatsHandler(
  sessionToken: string | null,
): Promise<{ ok: true; data: unknown } | HandlerError>;
