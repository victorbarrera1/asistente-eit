import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUrl,
  rankedUrls,
  hitAtK,
  reciprocalRank,
  summarize,
} from "./retrieval-metrics.js";
import { RETRIEVAL_CASES } from "./fixtures/retrieval-eval.js";
import { PAGES } from "./scrape.js";

test("normaliza barra final, mayúsculas del host y fragmentos", () => {
  assert.equal(normalizeUrl("https://EIT.udp.cl/a/#x"), normalizeUrl("https://eit.udp.cl/a"));
});

test("varios chunks de la misma página cuentan una sola vez en el ranking", () => {
  const ranked = rankedUrls([
    { url: "https://a.cl/x" },
    { url: "https://a.cl/x/" },
    { url: "https://a.cl/y" },
  ]);
  assert.deepEqual(ranked, ["a.cl/x", "a.cl/y"]);
});

test("hit@k y MRR", () => {
  const ranked = ["a.cl/x", "a.cl/y", "a.cl/z"];
  assert.equal(hitAtK(ranked, ["https://a.cl/y"], 1), 0);
  assert.equal(hitAtK(ranked, ["https://a.cl/y"], 3), 1);
  assert.equal(reciprocalRank(ranked, ["https://a.cl/z", "https://a.cl/y"]), 0.5);
  assert.equal(reciprocalRank(ranked, ["https://a.cl/nada"]), 0);
  const s = summarize([
    { id: "ok", ranked, expected: ["https://a.cl/x"] },
    { id: "falla", ranked, expected: ["https://a.cl/nada"] },
  ]);
  assert.equal(s.hit1, 0.5);
  assert.equal(s.mrr, 0.5);
  assert.deepEqual(s.fallidos, ["falla"]);
});

test("cada URL esperada del conjunto semilla existe en PAGES (etiquetas alcanzables)", () => {
  const indexadas = new Set(PAGES.map((p) => normalizeUrl(p.url)));
  const ids = new Set();
  for (const c of RETRIEVAL_CASES) {
    assert.ok(!ids.has(c.id), `id duplicado: ${c.id}`);
    ids.add(c.id);
    for (const url of c.expected)
      assert.ok(indexadas.has(normalizeUrl(url)), `${c.id}: ${url} no se scrapea`);
  }
});
