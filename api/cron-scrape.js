/**
 * Re-scraping automático (Vercel Cron — ver vercel.json).
 * Corre diariamente y procesa un lote rotativo de páginas, de modo que
 * todo el contenido se refresca completo cada ~8 días sin intervención manual.
 */
import { PAGES, scrapePage } from "./_lib/scrape.js";
import { authorizeCronRequest } from "./_lib/cron-auth.js";
import { getClientKey } from "./_lib/rate-limit.js";

const BATCH_SIZE = 6;

export default async function handler(req, res) {
  // Autorización fail-closed, en tiempo constante y con límite de intentos.
  const auth = authorizeCronRequest(req.headers.authorization, getClientKey(req));
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const day = Math.floor(Date.now() / 86400000);
  const totalBatches = Math.ceil(PAGES.length / BATCH_SIZE);
  const offset = (day % totalBatches) * BATCH_SIZE;
  const batch = PAGES.slice(offset, offset + BATCH_SIZE);

  const results = [];
  for (const page of batch) {
    try {
      const chunks = await scrapePage(page);
      results.push({ url: page.url, chunks });
    } catch (e) {
      results.push({ url: page.url, error: e.message });
    }
  }

  return res.status(200).json({
    lote: `${offset + 1}-${offset + batch.length} de ${PAGES.length}`,
    resultados: results,
  });
}
