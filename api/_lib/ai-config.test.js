/**
 * Coherencia de la configuración de IA.
 *
 * Estas pruebas cubren la clase de bug que ya rompió el índice dos veces: que el
 * modelo de embeddings, la dimensión, la columna y la función de búsqueda dejen
 * de apuntar al mismo espacio vectorial. El síntoma nunca es una excepción, es
 * cero resultados, y cero resultados se confunde con "no hay nada relevante".
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getAIConfig, assertAIConfig, EMBEDDING_SPACES } from "./rag.js";

const VARS = [
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "EMBED_DIM",
  "OLLAMA_EMBED_MODEL",
  "GEMINI_EMBED_MODEL",
];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
});

afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getAIConfig", () => {
  test("por defecto usa on-premise, que es el despliegue real de producción", () => {
    assert.equal(getAIConfig().provider, "ollama");
  });

  test("tener GEMINI_API_KEY NO cambia el proveedor por su cuenta", () => {
    // Regresión: la detección automática anterior hacía que la sola presencia de
    // la clave en el .env moviera todo el sistema a otro espacio vectorial.
    process.env.GEMINI_API_KEY = "una-clave-cualquiera";
    assert.equal(getAIConfig().provider, "ollama");
  });

  test("el proveedor solo cambia si se declara explícitamente", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "k";
    assert.equal(getAIConfig().provider, "gemini");
  });

  test("cada proveedor expone dimensión, columna y RPC de su propio espacio", () => {
    process.env.AI_PROVIDER = "ollama";
    const ollama = getAIConfig();
    assert.equal(ollama.embedDim, 1024);
    assert.equal(ollama.embedColumn, "embedding_1024");
    assert.equal(ollama.searchRpc, "buscar_docs_v2");

    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "k";
    const gemini = getAIConfig();
    assert.equal(gemini.embedDim, 768);
    assert.equal(gemini.embedColumn, "embedding");
    assert.equal(gemini.searchRpc, "buscar_docs");
  });

  test("embedModel sigue al proveedor activo, no al de Ollama", () => {
    // Regresión: searchDocs y scrape.js leían siempre ollamaEmbedModel, así que
    // con Gemini se etiquetaba "bge-m3" contenido vectorizado con otro modelo.
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_EMBED_MODEL = "text-embedding-004";
    process.env.OLLAMA_EMBED_MODEL = "bge-m3";
    assert.equal(getAIConfig().embedModel, "text-embedding-004");
  });

  test("ningún par de proveedores comparte columna: son espacios separados", () => {
    const columnas = Object.values(EMBEDDING_SPACES).map((s) => s.column);
    assert.equal(new Set(columnas).size, columnas.length);
  });
});

describe("assertAIConfig", () => {
  test("acepta una configuración coherente", () => {
    process.env.AI_PROVIDER = "ollama";
    assert.doesNotThrow(() => assertAIConfig());
  });

  test("rechaza un proveedor desconocido en vez de caer al default en silencio", () => {
    process.env.AI_PROVIDER = "openai";
    assert.throws(() => assertAIConfig(), /no es válido/);
  });

  test("rechaza gemini sin API key", () => {
    process.env.AI_PROVIDER = "gemini";
    assert.throws(() => assertAIConfig(), /requiere GEMINI_API_KEY/);
  });

  test("rechaza EMBED_DIM que no corresponde al proveedor", () => {
    // Este es EXACTAMENTE el desajuste que rompió el índice: 768 dims contra una
    // columna de 1024. Debe fallar al arrancar, no devolver cero filas.
    process.env.AI_PROVIDER = "ollama";
    process.env.EMBED_DIM = "768";
    assert.throws(() => assertAIConfig(), /no corresponde al proveedor/);
  });
});
