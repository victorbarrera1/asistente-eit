/**
 * Métricas de recuperación para evaluar el RAG sin pasar por el LLM.
 * Usadas por: scripts/eval-retrieval.js.
 *
 * Se mide la recuperación por separado de la generación porque es la causa más
 * común de respuestas malas: si el documento correcto no llega al contexto, el
 * modelo solo puede abstenerse o inventar.
 */

/** Normaliza una URL para comparar sin depender de "/" final, mayúsculas o fragmentos. */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return String(url ?? "")
      .trim()
      .toLowerCase()
      .replace(/\/+$/, "");
  }
}

/** URLs únicas en el orden en que aparecen (varios chunks de una página cuentan una vez). */
export function rankedUrls(docs) {
  const seen = new Set();
  const out = [];
  for (const doc of docs ?? []) {
    const url = normalizeUrl(doc?.url);
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** 1 si alguna URL esperada aparece entre las primeras k; 0 si no. */
export function hitAtK(ranked, expected, k) {
  const wanted = new Set(expected.map(normalizeUrl));
  return ranked.slice(0, k).some((url) => wanted.has(url)) ? 1 : 0;
}

/** Inverso del rango de la primera URL esperada (0 si no aparece). */
export function reciprocalRank(ranked, expected) {
  const wanted = new Set(expected.map(normalizeUrl));
  const index = ranked.findIndex((url) => wanted.has(url));
  return index === -1 ? 0 : 1 / (index + 1);
}

/**
 * Resume una corrida: `results` es [{ id, ranked: string[], expected: string[] }].
 * @returns {{casos: number, hit1: number, hit3: number, hit5: number, mrr: number, fallidos: string[]}}
 */
export function summarize(results) {
  const n = results.length || 1;
  const sum = (fn) => results.reduce((acc, r) => acc + fn(r), 0);
  return {
    casos: results.length,
    hit1: sum((r) => hitAtK(r.ranked, r.expected, 1)) / n,
    hit3: sum((r) => hitAtK(r.ranked, r.expected, 3)) / n,
    hit5: sum((r) => hitAtK(r.ranked, r.expected, 5)) / n,
    mrr: sum((r) => reciprocalRank(r.ranked, r.expected)) / n,
    fallidos: results.filter((r) => !hitAtK(r.ranked, r.expected, 5)).map((r) => r.id),
  };
}
