import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { searchDocs, rerankDocs, resetHybridSearchState } from "./rag.js";

const originalFetch = globalThis.fetch;
const env = { ...process.env };
let rpcCalls;
let hybridStatus;

beforeEach(() => {
  Object.assign(process.env, {
    SUPABASE_URL: "https://db.invalid",
    SUPABASE_SERVICE_KEY: "k",
    AI_PROVIDER: "ollama",
  });
  delete process.env.HYBRID_SEARCH;
  resetHybridSearchState();
  rpcCalls = [];
  hybridStatus = 200;
  globalThis.fetch = async (input, init) => {
    const name = String(input).split("/rpc/")[1];
    rpcCalls.push({ name, body: JSON.parse(init.body) });
    if (name === "buscar_docs_hibrido" && hybridStatus !== 200) {
      const code = hybridStatus === 404 ? "PGRST202" : "57014";
      return new Response(JSON.stringify({ code }), { status: hybridStatus });
    }
    return Response.json([
      { id: name, url: "https://eit.udp.cl/", contenido: "x", similitud: 0.7 },
    ]);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...env };
});

test("con texto de consulta usa la búsqueda híbrida y le pasa el texto", async () => {
  const [doc] = await searchDocs([0.1], 5, 0.55, "toma de ramos CIT-2000");
  assert.equal(doc.id, "buscar_docs_hibrido");
  assert.equal(rpcCalls[0].body.query_text, "toma de ramos CIT-2000");
  assert.equal(rpcCalls[0].body.p_embed_model, "bge-m3");
});

test("sin la migración 005 vuelve a buscar_docs_v2 y no reintenta en cada consulta", async () => {
  hybridStatus = 404;
  const [doc] = await searchDocs([0.1], 5, 0.55, "practica");
  assert.equal(doc.id, "buscar_docs_v2");
  rpcCalls = [];
  await searchDocs([0.1], 5, 0.55, "practica");
  assert.deepEqual(
    rpcCalls.map((c) => c.name),
    ["buscar_docs_v2"],
  );
});

test("un error distinto de 'no existe' no degrada en silencio: devuelve vacío", async () => {
  hybridStatus = 500;
  assert.deepEqual(await searchDocs([0.1], 5, 0.55, "practica"), []);
});

test("HYBRID_SEARCH=false y Gemini usan solo la búsqueda semántica", async () => {
  process.env.HYBRID_SEARCH = "false";
  assert.equal((await searchDocs([0.1], 5, 0.55, "x"))[0].id, "buscar_docs_v2");
  process.env.HYBRID_SEARCH = "true";
  process.env.AI_PROVIDER = "gemini";
  assert.equal((await searchDocs([0.1], 5, 0.55, "x"))[0].id, "buscar_docs");
});

test("el bono RRF está acotado y no supera a una similitud claramente mayor", () => {
  const docs = [
    { id: "lexico", similitud: 0.6, rrf_score: 1 },
    { id: "semantico", similitud: 0.9 },
  ];
  assert.deepEqual(
    rerankDocs(docs, "").map((d) => d.id),
    ["semantico", "lexico"],
  );
  const empate = [
    { id: "solo-vector", similitud: 0.7 },
    { id: "ambas", similitud: 0.7, rrf_score: 2 / 61 },
  ];
  assert.equal(rerankDocs(empate, "")[0].id, "ambas");
});
