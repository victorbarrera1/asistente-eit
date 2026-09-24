import { test } from "node:test";
import assert from "node:assert/strict";
import { streamOllama, streamGemini } from "./rag.js";

const encoder = new TextEncoder();
const config = { geminiKey: "test-placeholder", geminiModel: "test-model" };
const args = { messages: [{ role: "user", content: "consulta" }], systemPrompt: "reglas", baseUrl: "http://ollama.invalid", config };
const providers = [
  {
    name: "Ollama", stream: streamOllama,
    line: (text) => JSON.stringify({ message: { content: text } }) + "\n",
    end: JSON.stringify({ done: true, done_reason: "stop" }),
  },
  {
    name: "Gemini", stream: streamGemini,
    line: (text) => "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) + "\n\n",
    end: "data: " + JSON.stringify({ candidates: [{ finishReason: "STOP" }] }),
  },
];

for (const provider of providers) {
  test(`${provider.name}: conserva UTF-8 entre bytes y el registro final sin salto`, async (t) => {
    const bytes = encoder.encode(provider.line("Información de práctica: acción.") + provider.end);
    t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    })));
    const chunks = [];
    const text = await provider.stream({ ...args, onChunk: (chunk) => chunks.push(chunk) });
    assert.equal(text, "Información de práctica: acción.");
    assert.equal(chunks.join(""), text);
  });

  test(`${provider.name}: propaga el rechazo del validador y cancela la lectura`, async (t) => {
    let cancelled = false;
    t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode(provider.line("texto"))); },
      cancel() { cancelled = true; },
    })));
    const rejection = new Error("rechazo de prueba");
    await assert.rejects(provider.stream({ ...args, onChunk: () => { throw rejection; } }), (error) => error === rejection);
    assert.equal(cancelled, true);
  });

  test(`${provider.name}: exige finalización y falla con JSON inválido`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(provider.line("prefacio")));
    await assert.rejects(provider.stream({ ...args, onChunk: () => {} }), /interrumpido/);
    globalThis.fetch.mock.mockImplementation(async () => new Response(provider.name === "Gemini" ? "data: {malformado}\n" : "{malformado}\n"));
    await assert.rejects(provider.stream({ ...args, onChunk: () => {} }), /inválido/);
  });
}

test("Gemini: no considera completa una respuesta detenida por límite de tokens", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response('data: {"candidates":[{"finishReason":"MAX_TOKENS"}]}\n'));
  await assert.rejects(streamGemini({ ...args, onChunk: () => {} }), /incompleta/);
});
