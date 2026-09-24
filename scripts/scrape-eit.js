/**
 * Scraper RAG — EIT UDP (ejecución manual)
 * Uso: npm run scrape            (incremental: solo re-embebe lo que cambió)
 *      npm run scrape -- --force (re-ingiere todas las páginas)
 *
 * En producción lo ejecuta el timer systemd de la VM de ingesta
 * (ver deploy/scraper/README.md), no el cron de Vercel.
 *
 * La lógica y la lista de páginas viven en api/_lib/scrape.js,
 * compartidas con el cron automático (api/cron-scrape.js).
 * Para agregar páginas nuevas edita PAGES en api/_lib/scrape.js.
 */
import { PAGES, scrapePage } from "../api/_lib/scrape.js";
import { embedTexts, getAIConfig } from "../api/_lib/rag.js";

/**
 * Verifica contra Ollama que el modelo de embeddings existe y devuelve la
 * dimensión esperada, ANTES de scrapear ~50 páginas.
 *
 * Sin esto, un modelo mal configurado no se nota hasta que el retrieval empieza a
 * devolver ruido — que es exactamente como se rompió este pipeline antes.
 */
async function preflight() {
  const { ollamaBaseUrl, ollamaEmbedModel, embedDim } = getAIConfig();
  console.log(`🔍 Verificando ${ollamaEmbedModel} (${embedDim}d) en ${ollamaBaseUrl}...`);

  const [probe] = await embedTexts(["prueba de conectividad"]);
  console.log(`   ✓ Modelo responde con ${probe.length} dimensiones\n`);
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("❌ Faltan variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_KEY");
    process.exit(1);
  }

  try {
    await preflight();
  } catch (e) {
    console.error(`❌ Preflight falló: ${e.message}`);
    console.error("   No se scrapeó nada. Corrige la configuración de embeddings y reintenta.");
    process.exit(1);
  }

  const force = process.argv.includes("--force");
  console.log(`🚀 Scrapeando ${PAGES.length} páginas de EIT UDP${force ? " (--force)" : ""}...\n`);

  const fallidas = [];
  const conteo = { nueva: 0, actualizada: 0, sin_cambios: 0 };
  for (const page of PAGES) {
    try {
      const { estado } = await scrapePage(page, { force });
      conteo[estado]++;
    } catch (err) {
      console.error(`  ❌ Error en ${page.url}: ${err.message}`);
      fallidas.push({ url: page.url, error: err.message });
    }
  }

  // Salir con código != 0 si algo falló. Antes se imprimía "✅ completado" incluso
  // si todas las páginas habían fallado, lo que hacía imposible automatizar el
  // pipeline o darse cuenta de un fallo parcial.
  if (fallidas.length) {
    console.error(`\n⚠️  ${fallidas.length}/${PAGES.length} páginas fallaron:`);
    for (const f of fallidas) console.error(`   - ${f.url}: ${f.error}`);
    console.error(
      "\nLas páginas que sí se ingirieron quedaron actualizadas (cada URL es atómica).",
    );
    process.exit(1);
  }

  console.log(
    `\n✅ Pipeline RAG completado: ${PAGES.length}/${PAGES.length} páginas ` +
      `(${conteo.nueva} nuevas, ${conteo.actualizada} actualizadas, ${conteo.sin_cambios} sin cambios).`,
  );
}

main();
