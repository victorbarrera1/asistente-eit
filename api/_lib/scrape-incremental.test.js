import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { scrapePage, contentHash, embeddingModelFilter } from "./scrape.js";

const PAGE = {
  url: "https://eit.udp.cl/prueba/",
  escuela: "EIT",
  seccion: "Prueba",
  titulo: "Prueba",
};
const parrafo = (n) =>
  `<p>Párrafo ${n} con información administrativa suficiente para superar el mínimo de largo exigido.</p>`;

let html;
let etag;
let docs;
let registro;
let historial;
let calls;
const originalFetch = globalThis.fetch;
const env = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, {
    SUPABASE_URL: "https://db.invalid",
    SUPABASE_SERVICE_KEY: "k",
    AI_PROVIDER: "ollama",
    OLLAMA_BASE_URL: "http://ollama.invalid",
    OLLAMA_EMBED_MODEL: "bge-m3",
  });
  delete process.env.EMBED_DIM;
  delete process.env.SCRAPE_SNAPSHOT_DIR;
  html = `<article>${parrafo(1)}${parrafo(2)}</article>`;
  etag = '"v1"';
  docs = [];
  registro = new Map();
  historial = [];
  calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    calls.push(`${method} ${url.host}${url.pathname}`);
    const q = url.searchParams;

    if (url.host === "eit.udp.cl") {
      const headers = new Headers(init.headers);
      if (headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
      return new Response(html, { headers: { ETag: etag } });
    }
    if (url.host === "ollama.invalid") {
      const { input: texts } = JSON.parse(init.body);
      return Response.json({ embeddings: texts.map(() => Array(1024).fill(0.1)) });
    }

    const table = url.pathname.split("/").pop();
    if (table === "eit_docs") {
      if (method === "POST") {
        docs.push(JSON.parse(init.body));
        return new Response(null, { status: 201 });
      }
      if (method === "GET") {
        const batch = q.get("batch_id").slice(3);
        const n = docs.filter((d) => d.batch_id === batch).length;
        return new Response("[]", { headers: { "content-range": `0-0/${n}` } });
      }
      if (method === "DELETE") {
        const keep = q.get("batch_id").slice(4);
        const model = q.get("embedding_model")?.slice(3);
        docs = docs.filter((d) => d.batch_id === keep || (model && d.embedding_model !== model));
        return new Response(null, { status: 204 });
      }
    }
    if (table === "eit_paginas") {
      const key = decodeURIComponent(q.get("url")?.slice(3) ?? "");
      if (method === "GET") return Response.json(registro.has(key) ? [registro.get(key)] : []);
      if (method === "POST") {
        const row = JSON.parse(init.body);
        registro.set(row.url, row);
        return new Response(null, { status: 201 });
      }
      if (method === "PATCH") return new Response(null, { status: 204 });
    }
    if (table === "eit_paginas_historial") {
      historial.push(JSON.parse(init.body));
      return new Response(null, { status: 201 });
    }
    throw new Error(`fetch inesperado: ${method} ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...env };
});

const log = () => {};
const embedCalls = () => calls.filter((c) => c.includes("ollama.invalid")).length;

test("primera ingesta registra versión e historial", async () => {
  const result = await scrapePage(PAGE, { log });
  assert.equal(result.estado, "nueva");
  assert.ok(result.chunks >= 1);
  assert.equal(docs.length, result.chunks);
  assert.equal(registro.get(PAGE.url).etag, '"v1"');
  assert.equal(historial.length, 1);
});

test("un 304 con el batch intacto no descarga ni re-embebe", async () => {
  await scrapePage(PAGE, { log });
  const before = embedCalls();
  const result = await scrapePage(PAGE, { log });
  assert.equal(result.estado, "sin_cambios");
  assert.equal(embedCalls(), before);
  assert.equal(historial.length, 1);
});

test("mismo contenido con otro ETag se detecta por hash y no re-embebe", async () => {
  await scrapePage(PAGE, { log });
  etag = '"v2"';
  const before = embedCalls();
  assert.equal((await scrapePage(PAGE, { log })).estado, "sin_cambios");
  assert.equal(embedCalls(), before);
});

test("contenido nuevo reemplaza el batch anterior y agrega historial", async () => {
  await scrapePage(PAGE, { log });
  const viejo = registro.get(PAGE.url).batch_id;
  etag = '"v2"';
  html = `<article>${parrafo(1)}${parrafo(3)}</article>`;
  const result = await scrapePage(PAGE, { log });
  assert.equal(result.estado, "actualizada");
  assert.ok(docs.every((d) => d.batch_id !== viejo));
  assert.equal(historial.length, 2);
});

test("si se perdieron las filas del batch, un 304 no basta: re-ingiere", async () => {
  await scrapePage(PAGE, { log });
  docs = [];
  const result = await scrapePage(PAGE, { log });
  assert.notEqual(result.estado, "sin_cambios");
  assert.ok(docs.length > 0);
});

test("--force ignora el registro", async () => {
  await scrapePage(PAGE, { log });
  const before = embedCalls();
  await scrapePage(PAGE, { log, force: true });
  assert.ok(embedCalls() > before);
});

test("el borrado de versiones viejas no toca otro espacio vectorial", async () => {
  docs.push({ url: PAGE.url, batch_id: "gemini-batch", embedding_model: "text-embedding-004" });
  await scrapePage(PAGE, { log });
  assert.ok(docs.some((d) => d.batch_id === "gemini-batch"));
});

test("filtros y hash dependen del espacio y del pipeline", () => {
  assert.equal(embeddingModelFilter("ollama", "bge-m3"), "embedding_model=eq.bge-m3");
  assert.match(embeddingModelFilter("gemini", "text-embedding-004"), /embedding_model\.is\.null/);
  assert.notEqual(contentHash("x", "bge-m3"), contentHash("x", "otro"));
});

test("una redirección fuera de *.udp.cl se bloquea antes de pedirla (SSRF)", async () => {
  const pedidas = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    pedidas.push(url.host);
    if (url.host === "eit.udp.cl") {
      return new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1:11434/api/tags" },
      });
    }
    if (url.pathname.endsWith("/eit_paginas")) return Response.json([]);
    throw new Error(`fetch inesperado: ${init.method ?? "GET"} ${url}`);
  };
  await assert.rejects(scrapePage(PAGE, { log }), /fuera de \*\.udp\.cl/);
  assert.ok(!pedidas.includes("127.0.0.1:11434"));
});

test("sigue redirecciones dentro de *.udp.cl", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.host === "eit.udp.cl" && url.pathname === "/prueba/") {
      return new Response(null, {
        status: 301,
        headers: { Location: "https://www.udp.cl/nueva/" },
      });
    }
    if (url.host === "www.udp.cl") return original(new URL("https://eit.udp.cl/otra/"), init);
    return original(input, init);
  };
  assert.equal((await scrapePage(PAGE, { log })).estado, "nueva");
});
