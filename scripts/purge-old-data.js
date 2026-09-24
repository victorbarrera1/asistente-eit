/**
 * Retención de datos de estudiantes — borra registros más antiguos que el plazo.
 * Uso:  npm run purge:data -- --dry-run   (solo cuenta)
 *       npm run purge:data                (borra)
 *
 * Plazo: DATA_RETENTION_DAYS (por defecto 180). El valor definitivo lo decide la
 * DTI/Escuela; ver docs/privacidad-y-retencion.md. Lo ejecuta el timer semanal
 * de la VM de ingesta (deploy/scraper/).
 *
 * Solo toca tablas con texto escrito por estudiantes. El corpus institucional
 * (eit_docs, eit_paginas_historial) no es dato personal y no se purga acá.
 */
const TABLAS = ["preguntas_log", "feedback", "satisfaction_feedback"];
const MIN_DIAS = 30; // Protección contra un DATA_RETENTION_DAYS=0 accidental.

async function contar(base, headers, tabla, filtro) {
  const res = await fetch(`${base}/${tabla}?${filtro}&select=created_at`, {
    method: "HEAD",
    headers: { ...headers, Prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`${tabla}: HTTP ${res.status}`);
  return Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
}

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY");
    process.exit(1);
  }
  const dias = Number(process.env.DATA_RETENTION_DAYS || 180);
  if (!Number.isFinite(dias) || dias < MIN_DIAS) {
    console.error(`❌ DATA_RETENTION_DAYS debe ser un número ≥ ${MIN_DIAS}`);
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const corte = new Date(Date.now() - dias * 86400000).toISOString();
  const filtro = `created_at=lt.${encodeURIComponent(corte)}`;
  const base = `${SUPABASE_URL}/rest/v1`;
  const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };

  console.log(`🧹 Retención ${dias} días · corte ${corte}${dryRun ? " · simulación" : ""}`);
  let fallos = 0;
  for (const tabla of TABLAS) {
    try {
      const n = await contar(base, headers, tabla, filtro);
      if (!dryRun && n > 0) {
        const res = await fetch(`${base}/${tabla}?${filtro}`, {
          method: "DELETE",
          headers: { ...headers, Prefer: "return=minimal" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      console.log(`   ${tabla}: ${n} ${dryRun ? "por borrar" : "borrados"}`);
    } catch (e) {
      fallos++;
      console.error(`   ❌ ${tabla}: ${e.message}`);
    }
  }
  if (fallos) process.exit(1);
}

main();
