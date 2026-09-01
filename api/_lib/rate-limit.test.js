/**
 * Rate limiting y resolución de IP.
 *
 * getClientKey es seguridad, no una utilidad: si la clave sale de un header que
 * el cliente controla, el límite se evade rotándolo. Eso permitió intentos
 * ilimitados contra la contraseña de admin, así que estas pruebas fijan el
 * comportamiento para que no vuelva a relajarse en un refactor.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, getClientKey } from "./rate-limit.js";

/** Simula un request tipo Fetch (TanStack Start / Dokku). */
function fetchRequest(headers) {
  return { headers: new Headers(headers) };
}

/** Simula un request tipo Node/Vercel. */
function nodeRequest(headers, remoteAddress) {
  return { headers, socket: { remoteAddress } };
}

describe("createRateLimiter", () => {
  test("permite hasta maxAttempts y bloquea después", () => {
    const l = createRateLimiter({ windowMs: 60000, maxAttempts: 3 });
    for (let i = 0; i < 3; i++) {
      assert.equal(l.isLimited("ip"), false);
      l.register("ip");
    }
    assert.equal(l.isLimited("ip"), true);
  });

  test("las claves son independientes entre sí", () => {
    const l = createRateLimiter({ windowMs: 60000, maxAttempts: 1 });
    l.register("ip-a");
    assert.equal(l.isLimited("ip-a"), true);
    assert.equal(l.isLimited("ip-b"), false);
  });

  test("la ventana expira y el contador se reinicia", async () => {
    const l = createRateLimiter({ windowMs: 20, maxAttempts: 1 });
    l.register("ip");
    assert.equal(l.isLimited("ip"), true);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(l.isLimited("ip"), false);
  });
});

describe("getClientKey", () => {
  const VARS = ["TRUSTED_IP_HEADER", "VERCEL", "VERCEL_ENV"];
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

  test("prefiere x-real-ip sobre x-forwarded-for", () => {
    // Nginx (Dokku) asigna x-real-ip con la IP real del socket; x-forwarded-for
    // arrastra lo que el cliente haya enviado.
    const req = fetchRequest({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" });
    assert.equal(getClientKey(req), "9.9.9.9");
  });

  test("rotar x-forwarded-for no cambia la clave si hay header confiable", () => {
    // Regresión del bypass de brute-force en /api/admin-login.
    const a = getClientKey(fetchRequest({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "10.0.0.1" }));
    const b = getClientKey(fetchRequest({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "10.0.0.2" }));
    assert.equal(a, b);
  });

  test("TRUSTED_IP_HEADER tiene prioridad sobre todo lo demás", () => {
    process.env.TRUSTED_IP_HEADER = "cf-connecting-ip";
    const req = fetchRequest({ "cf-connecting-ip": "3.3.3.3", "x-real-ip": "9.9.9.9" });
    assert.equal(getClientKey(req), "3.3.3.3");
  });

  test("cf-connecting-ip NO se usa si no fue declarado como confiable", () => {
    // Ni Vercel ni Dokku lo asignan, así que sin declararlo es un header
    // puramente controlado por el atacante.
    const req = fetchRequest({ "cf-connecting-ip": "6.6.6.6", "x-real-ip": "9.9.9.9" });
    assert.equal(getClientKey(req), "9.9.9.9");
  });

  test("de x-forwarded-for toma el último salto, no el primero", () => {
    // El primero lo pone el cliente; el último lo agrega el proxy de confianza.
    const req = fetchRequest({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 8.8.8.8" });
    assert.equal(getClientKey(req), "8.8.8.8");
  });

  test("soporta requests estilo Node y cae al socket", () => {
    assert.equal(getClientKey(nodeRequest({ "x-real-ip": "9.9.9.9" })), "9.9.9.9");
    assert.equal(getClientKey(nodeRequest({}, "7.7.7.7")), "7.7.7.7");
  });

  test("sin request devuelve 'unknown' en vez de lanzar", () => {
    assert.equal(getClientKey(null), "unknown");
  });
});
