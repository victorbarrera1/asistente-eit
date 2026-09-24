export const MAX_JSON_BODY_BYTES: number;

export type JsonBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export function isJsonContentType(value: string | null | undefined): boolean;
export function readJsonBody(request: Request, maxBytes?: number): Promise<JsonBodyResult>;
export function validateParsedJsonBody(
  req: { headers?: Record<string, string | string[] | undefined>; body?: unknown },
  maxBytes?: number,
): JsonBodyResult;
