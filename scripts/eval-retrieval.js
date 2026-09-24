/**
 * Evaluación de recuperación — compara búsqueda semántica vs. híbrida.
 * Uso:  npm run eval:retrieval
 *       npm run eval:retrieval -- --json reporte.json --min-hit5 0.8
 *
 * Usa el corpus y el modelo de embeddings REALES (Supabase + Ollama), pero no
 * llama al LLM: mide solo si la página correcta llega al contexto. Correrlo en la
 * VM de ingesta después de cada scrape o cambio de chunking/umbral.
 */
import { writeFile } from "node:fs/promises";
import { embedText, searchDocs, DEFAULT_MATCH_THRESHOLD } from "../api/_lib/rag.js";
import { rankedUrls, summarize } from "../api/_lib/retrieval-metrics.js";
import { RETRIEVAL_CASES } from "../api/_lib/fixtures/retrieval-eval.js";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function run(mode, embeddings) {
  process.env.HYBRID_SEARCH = mode === "hibrida" ? "true" : "false";
  const results = [];
  for (const c of RETRIEVAL_CASES) {
    const docs = await searchDocs(embeddings.get(c.id), 5, DEFAULT_MATCH_THRESHOLD, c.query);
    results.push({ id: c.id, expected: c.expected, ranked: rankedUrls(docs) });
  }
  return { mode, ...summarize(results), detalle: results };
}

const pct = (x) => `${(x * 100).toFixed(0)}%`.padStart(5);

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY");
    process.exit(1);
  }

  // Los embeddings se calculan una vez: ambas corridas comparan lo mismo.
  const embeddings = new Map();
  for (const c of RETRIEVAL_CASES) embeddings.set(c.id, await embedText(c.query));

  const runs = [await run("semantica", embeddings), await run("hibrida", embeddings)];

  console.log(
    `\nRecuperación sobre ${RETRIEVAL_CASES.length} consultas semilla (no validadas por la Escuela)\n`,
  );
  console.log("modo        hit@1  hit@3  hit@5    MRR");
  for (const r of runs) {
    console.log(
      `${r.mode.padEnd(10)}  ${pct(r.hit1)}  ${pct(r.hit3)}  ${pct(r.hit5)}  ${r.mrr.toFixed(2).padStart(5)}`,
    );
  }
  for (const r of runs) {
    if (r.fallidos.length)
      console.log(`\n${r.mode} — sin la página esperada en el top 5: ${r.fallidos.join(", ")}`);
  }

  const jsonPath = arg("--json");
  if (jsonPath) {
    await writeFile(jsonPath, JSON.stringify({ fecha: new Date().toISOString(), runs }, null, 2));
    console.log(`\n📝 Reporte: ${jsonPath}`);
  }

  const min = Number(arg("--min-hit5"));
  const best = runs.at(-1);
  if (Number.isFinite(min) && best.hit5 < min) {
    console.error(
      `\n❌ hit@5 de ${best.mode} (${pct(best.hit5).trim()}) bajo el mínimo ${pct(min).trim()}`,
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
