import { test } from "node:test";
import assert from "node:assert/strict";
import { readJsonBody, validateParsedJsonBody, isJsonContentType } from "./http-body.js";

const json = { "Content-Type": "application/json" };

function chunkedRequest(parts, headers = json) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  // Sin Content-Length: es exactamente el caso que el filtro de server.ts no veía.
  return new Request("https://eit.invalid/api/chat", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  });
}

test("acepta un objeto JSON dentro del tope", async () => {
  const result = await readJsonBody(chunkedRequest(['{"messages":', "[]}"]));
  assert.deepEqual(result, { ok: true, body: { messages: [] } });
});

test("corta un cuerpo chunked que supera el tope aunque no declare Content-Length", async () => {
  const result = await readJsonBody(chunkedRequest(["x".repeat(600), "y".repeat(600)]), 1000);
  assert.equal(result.status, 413);
});

test("rechaza Content-Length declarado por encima del tope sin leer el cuerpo", async () => {
  const request = new Request("https://eit.invalid/api/chat", {
    method: "POST",
    headers: { ...json, "Content-Length": "999999" },
    body: "{}",
  });
  assert.equal((await readJsonBody(request, 1000)).status, 413);
});

test("exige application/json (cierra POST simples cross-site)", async () => {
  const result = await readJsonBody(chunkedRequest(["{}"], { "Content-Type": "text/plain" }));
  assert.equal(result.status, 415);
  assert.ok(isJsonContentType("application/json; charset=utf-8"));
  assert.ok(!isJsonContentType("application/jsonp"));
});

test("null, arreglos, primitivos, JSON roto y UTF-8 inválido son 400", async () => {
  for (const raw of ["null", "[]", "3", '"x"', "{roto"]) {
    assert.equal((await readJsonBody(chunkedRequest([raw]))).status, 400, raw);
  }
  const invalidUtf8 = new Request("https://eit.invalid/api/chat", {
    method: "POST",
    headers: json,
    body: new Uint8Array([0x7b, 0xff, 0x7d]),
  });
  assert.equal((await readJsonBody(invalidUtf8)).status, 400);
});

test("variante Vercel: valida el cuerpo ya parseado y el tope declarado", () => {
  const headers = { "content-type": "application/json" };
  assert.deepEqual(validateParsedJsonBody({ headers, body: { a: 1 } }), {
    ok: true,
    body: { a: 1 },
  });
  assert.equal(validateParsedJsonBody({ headers, body: null }).status, 400);
  assert.equal(validateParsedJsonBody({ headers: {}, body: { a: 1 } }).status, 415);
  assert.equal(
    validateParsedJsonBody({ headers: { ...headers, "content-length": "500000" }, body: {} })
      .status,
    413,
  );
  assert.equal(validateParsedJsonBody({ headers, body: "x".repeat(2000) }, 1000).status, 413);
});
