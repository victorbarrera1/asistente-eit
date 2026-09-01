import { createFileRoute } from "@tanstack/react-router";
import { PAGES, scrapePage } from "../../api/_lib/scrape.js";
import { authorizeCronRequest } from "../../api/_lib/cron-auth.js";
import { getClientKey } from "../../api/_lib/rate-limit.js";

const BATCH_SIZE = 6;

async function handleScrape(request: Request) {
  // Autorización fail-closed, en tiempo constante y con límite de intentos.
  const auth = authorizeCronRequest(request.headers.get("authorization"), getClientKey(request));
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const day = Math.floor(Date.now() / 86400000);
  const totalBatches = Math.ceil(PAGES.length / BATCH_SIZE);
  const offset = (day % totalBatches) * BATCH_SIZE;
  const batch = PAGES.slice(offset, offset + BATCH_SIZE);

  const results: Array<{ url: string; chunks?: number; error?: string }> = [];
  for (const page of batch) {
    try {
      const chunks = await scrapePage(page);
      results.push({ url: page.url, chunks });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ url: page.url, error: msg });
    }
  }

  return Response.json({
    lote: `${offset + 1}-${offset + batch.length} de ${PAGES.length}`,
    resultados: results,
  });
}

export const Route = createFileRoute("/api/cron-scrape")({
  server: {
    handlers: {
      GET: async ({ request }) => handleScrape(request),
      POST: async ({ request }) => handleScrape(request),
    },
  },
});
