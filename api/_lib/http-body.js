/**
 * Lectura acotada de cuerpos JSON para todos los POST de /api/*.
 * Usada por: src/routes/api.*.ts (Dokku / dev) y api/*.js (Vercel).
 *
 * `request.json()` bufferea el cuerpo completo antes de validar nada. El filtro
 * de src/server.ts solo mira Content-Length, y una petición con
 * `Transfer-Encoding: chunked` no lo declara: pasaba el filtro y se leía entera.
 * Acá se cuentan los bytes a medida que llegan y se corta al superar el tope.
 */

// El chat admite 12 mensajes de 3.000 caracteres (~36 KB en UTF-8 holgado);
// el feedback bastante menos. Debe coincidir con MAX_BODY_BYTES de src/server.ts.
export const MAX_JSON_BODY_BYTES = 128 * 1024;

const TOO_LARGE = { ok: false, status: 413, error: "La petición es demasiado grande." };
const INVALID = { ok: false, status: 400, error: "Cuerpo de la petición inválido." };
const WRONG_TYPE = {
  ok: false,
  status: 415,
  error: "El cuerpo debe enviarse como application/json.",
};

/**
 * Exigir application/json también cierra los POST "simples" que un navegador
 * puede mandar cross-site sin preflight CORS (text/plain, form-urlencoded).
 */
export function isJsonContentType(value) {
  return /^application\/json\s*(;|$)/i.test(String(value ?? "").trim());
}

function declaredLengthTooLarge(value, maxBytes) {
  const declared = Number(value);
  return Number.isFinite(declared) && declared > maxBytes;
}

/** Solo se aceptan objetos: `null`, arreglos o primitivos no son cuerpos válidos. */
function parseObject(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return INVALID;
    return { ok: true, body: parsed };
  } catch {
    return INVALID;
  }
}

/**
 * Lee y parsea el cuerpo de un Request (Fetch API) sin superar `maxBytes`.
 * @returns {Promise<{ok: true, body: Record<string, unknown>} | {ok: false, status: number, error: string}>}
 */
export async function readJsonBody(request, maxBytes = MAX_JSON_BODY_BYTES) {
  if (!isJsonContentType(request.headers.get("content-type"))) return WRONG_TYPE;
  if (declaredLengthTooLarge(request.headers.get("content-length"), maxBytes)) return TOO_LARGE;
  if (!request.body) return INVALID;

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return TOO_LARGE;
      }
      chunks.push(value);
    }
  } catch {
    return INVALID;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return INVALID;
  }
  return parseObject(text);
}

/**
 * Equivalente para las funciones Node de Vercel (req/res), donde la plataforma
 * ya parseó `req.body`. Vercel acepta cuerpos de hasta 100 MB, así que el tope
 * propio se aplica igual sobre lo declarado y sobre lo recibido.
 */
export function validateParsedJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  if (!isJsonContentType(req.headers?.["content-type"])) return WRONG_TYPE;
  if (declaredLengthTooLarge(req.headers?.["content-length"], maxBytes)) return TOO_LARGE;

  const body = req.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > maxBytes) return TOO_LARGE;
    return parseObject(body);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return INVALID;
  return { ok: true, body };
}
