import { test } from "node:test";
import assert from "node:assert/strict";
import { rerankDocs } from "./rag.js";

test("el contrato SQL similitud decide el orden con igual coincidencia textual", () => {
  const docs = [
    { id: 1, titulo: "Prácticas", contenido: "Requisitos", similitud: 0.6 },
    { id: 2, titulo: "Prácticas", contenido: "Requisitos", similitud: 0.99 },
  ];
  assert.deepEqual(rerankDocs(docs, "requisitos").map((doc) => doc.id), [2, 1]);
  assert.equal(docs[0].finalScore, undefined);
});

test("compatibilidad con similarity y precedencia explícita, incluido cero", () => {
  const [doc] = rerankDocs([{ similarity: 0, similitud: 0.9 }], "");
  assert.equal(doc.finalScore, 0);
  assert.equal(rerankDocs([{ similarity: 0.8 }], "")[0].finalScore, 0.8 * 0.7);
});

test("solo usa 0.5 cuando ambos campos faltan; conserva cero en español", () => {
  assert.equal(rerankDocs([{ similitud: 0 }], "")[0].finalScore, 0);
  assert.equal(rerankDocs([{ similarity: null, similitud: 0.8 }], "")[0].finalScore, 0.8 * 0.7);
  assert.equal(rerankDocs([{}], "")[0].finalScore, 0.5 * 0.7);
  assert.deepEqual(rerankDocs([], "practica"), []);
});
