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

/** Simula un request tipo Fetch (TanStack Start / Dokku); `ip` = socket (srvx). */
function fetchRequest(headers, ip) {
  return { headers: new Headers(headers), ip };
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
  const VARS = [
    "TRUSTED_IP_HEADER",
    "TRUSTED_PROXY_CIDRS",
    "TRUSTED_PROXY_HOPS",
    "VERCEL",
    "VERCEL_ENV",
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

  // Nginx de Dokku conecta a la app desde la red de Docker (privada).
  const viaNginx = (headers) => fetchRequest(headers, "172.17.0.1");

  test("regresión: rotar X-Real-IP detrás de Nginx NO cambia la clave", () => {
    // Nginx de Dokku no reescribe X-Real-IP por defecto: el valor es del cliente.
    const a = getClientKey(viaNginx({ "x-real-ip": "10.9.9.1", "x-forwarded-for": "8.8.8.8" }));
    const b = getClientKey(viaNginx({ "x-real-ip": "10.9.9.2", "x-forwarded-for": "8.8.8.8" }));
    assert.equal(a, "8.8.8.8");
    assert.equal(a, b);
  });

  test("detrás de un proxy de confianza toma el último salto de X-Forwarded-For", () => {
    // El primero lo escribe el cliente; el último lo agrega Nginx.
    assert.equal(
      getClientKey(viaNginx({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 8.8.8.8" })),
      "8.8.8.8",
    );
  });

  test("conexión directa desde fuera: las cabeceras se ignoran y manda el socket", () => {
    const req = fetchRequest(
      { "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" },
      "203.0.113.7",
    );
    assert.equal(getClientKey(req), "203.0.113.7");
  });

  test("TRUSTED_PROXY_HOPS=2 salta el balanceador delante de Nginx", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    const req = viaNginx({ "x-forwarded-for": "6.6.6.6, 198.51.100.4, 10.0.0.5" });
    assert.equal(getClientKey(req), "198.51.100.4");
  });

  test("TRUSTED_IP_HEADER solo se acepta si la conexión viene de un proxy de confianza", () => {
    process.env.TRUSTED_IP_HEADER = "x-real-ip";
    assert.equal(getClientKey(viaNginx({ "x-real-ip": "3.3.3.3" })), "3.3.3.3");
    assert.equal(
      getClientKey(fetchRequest({ "x-real-ip": "3.3.3.3" }, "203.0.113.9")),
      "203.0.113.9",
    );
  });

  test("TRUSTED_PROXY_CIDRS=none desactiva toda confianza en cabeceras", () => {
    process.env.TRUSTED_PROXY_CIDRS = "none";
    assert.equal(getClientKey(viaNginx({ "x-forwarded-for": "8.8.8.8" })), "172.17.0.1");
  });

  test("valores que no son IP se descartan (no se usan como clave elegida por el atacante)", () => {
    assert.equal(
      getClientKey(viaNginx({ "x-forwarded-for": "admin, cualquier-cosa" })),
      "172.17.0.1",
    );
  });

  test("IPv6 se agrupa por /64 y se normaliza IPv4-mapped", () => {
    const a = getClientKey(fetchRequest({}, "2001:db8:1:2::1"));
    const b = getClientKey(fetchRequest({}, "2001:db8:1:2:ffff::9"));
    assert.equal(a, b);
    assert.equal(a, "2001:0db8:0001:0002::/64");
    assert.equal(getClientKey(fetchRequest({}, "::ffff:203.0.113.5")), "203.0.113.5");
  });

  test("en Vercel usa x-vercel-forwarded-for", () => {
    process.env.VERCEL = "1";
    assert.equal(
      getClientKey(nodeRequest({ "x-vercel-forwarded-for": "4.4.4.4" }, "10.0.0.1")),
      "4.4.4.4",
    );
  });

  test("soporta requests estilo Node y cae al socket", () => {
    assert.equal(getClientKey(nodeRequest({ "x-real-ip": "9.9.9.9" }, "7.7.7.7")), "7.7.7.7");
  });

  test("sin IP de socket usa una clave compartida, nunca una cabecera", () => {
    assert.equal(getClientKey(fetchRequest({ "x-forwarded-for": "5.5.5.5" })), "unknown");
    assert.equal(getClientKey(null), "unknown");
  });
});

describe("tabla llena", () => {
  test("una clave nueva se registra igual y queda limitada (no fail-open)", () => {
    const l = createRateLimiter({ windowMs: 60000, maxAttempts: 1 });
    for (let i = 0; i < 10001; i++) l.register(`relleno-${i}`);
    l.register("atacante");
    assert.equal(l.isLimited("atacante"), true);
  });
});
