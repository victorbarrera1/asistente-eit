/**
 * Controles de acceso del panel de administración.
 *
 * El panel expone las preguntas de los estudiantes y el feedback, así que no es
 * un secreto trivial. El rate limiting por sí solo no basta: 5 intentos cada 5
 * minutos son ~1.440 al día, suficientes para agotar un diccionario corto.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluarFortalezaClave, origenPermitido } from "./admin-handler.js";

describe("evaluarFortalezaClave", () => {
  const debiles = [
    ["admin", "palabra obvia y corta"],
    ["eit2026", "nombre del proyecto"],
    ["password", "clásica de diccionario"],
    ["12345678", "solo dígitos"],
    ["soloMinusculasLargas", "larga pero sin variedad"],
  ];
  for (const [clave, motivo] of debiles) {
    test(`rechaza ${motivo}: "${clave}"`, () => {
      assert.equal(evaluarFortalezaClave(clave).ok, false);
    });
  }

  test("rechaza una clave ausente", () => {
    assert.equal(evaluarFortalezaClave(undefined).ok, false);
    assert.equal(evaluarFortalezaClave("").ok, false);
  });

  const fuertes = ["Rk7$mzQ2vLp9!x", "correcto-Caballo-42-bateria"];
  for (const clave of fuertes) {
    test(`acepta una clave robusta: "${clave}"`, () => {
      assert.equal(evaluarFortalezaClave(clave).ok, true);
    });
  }
});

describe("origenPermitido", () => {
  test("acepta el mismo host", () => {
    assert.equal(origenPermitido("https://chatudp.vercel.app", "chatudp.vercel.app"), true);
  });

  test("acepta subdominios institucionales", () => {
    assert.equal(origenPermitido("https://asistente.eit.udp.cl", "otro.host"), true);
  });

  test("rechaza un sitio externo", () => {
    assert.equal(origenPermitido("https://sitio-atacante.cl", "chatudp.vercel.app"), false);
  });

  test("rechaza un dominio que solo termina parecido", () => {
    // "udp.cl.atacante.com" no debe pasar por contener "udp.cl".
    assert.equal(origenPermitido("https://udp.cl.atacante.com", "chatudp.vercel.app"), false);
  });

  test("rechaza un Origin malformado", () => {
    assert.equal(origenPermitido("no-es-una-url", "chatudp.vercel.app"), false);
  });

  test("sin Origin no bloquea", () => {
    // Clientes no navegador y navegaciones de primer nivel no envían Origin; la
    // cookie HttpOnly y el rate limiting siguen siendo la defensa principal.
    assert.equal(origenPermitido(null, "chatudp.vercel.app"), true);
  });
});

describe("longitud mínima de secretos", () => {
  test("CRON_SECRET corto se rechaza aunque el header coincida (fail-closed)", async () => {
    const { authorizeCronRequest } = await import("./cron-auth.js");
    const previo = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = "corto";
      assert.equal(authorizeCronRequest("Bearer corto", "ip-secreto-corto").ok, false);
      process.env.CRON_SECRET = "s".repeat(40);
      assert.equal(authorizeCronRequest(`Bearer ${"s".repeat(40)}`, "ip-secreto-largo").ok, true);
    } finally {
      if (previo === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previo;
    }
  });

  test("ADMIN_SESSION_SECRET corto invalida sesiones en producción", async () => {
    const { createSessionToken, isValidSessionToken } = await import("./admin-session.js");
    const previo = { ...process.env };
    try {
      process.env.ADMIN_SESSION_SECRET = "x".repeat(40);
      const token = createSessionToken();
      process.env.NODE_ENV = "production";
      assert.equal(isValidSessionToken(token), true);
      process.env.ADMIN_SESSION_SECRET = "corto";
      assert.equal(isValidSessionToken(token), false);
      assert.throws(() => createSessionToken(), /al menos 32/);
    } finally {
      process.env = previo;
    }
  });
});

describe("sesión de admin", () => {
  test("logout revoca el token en el servidor", async () => {
    const { createSessionToken, isValidSessionToken, revokeSessionToken } =
      await import("./admin-session.js");
    const previo = { ...process.env };
    try {
      process.env.ADMIN_SESSION_SECRET = "r".repeat(40);
      const token = createSessionToken();
      assert.equal(isValidSessionToken(token), true);
      assert.equal(revokeSessionToken(token), true);
      assert.equal(isValidSessionToken(token), false);
    } finally {
      process.env = previo;
    }
  });

  test("un token firmado con expiración más allá del TTL se rechaza", async () => {
    const { isValidSessionToken } = await import("./admin-session.js");
    const { createHmac } = await import("node:crypto");
    const previo = { ...process.env };
    try {
      process.env.ADMIN_SESSION_SECRET = "t".repeat(40);
      const payload = `${Date.now() + 365 * 86400000}.nonce`;
      const sig = createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
        .update(payload)
        .digest("base64url");
      assert.equal(isValidSessionToken(`${payload}.${sig}`), false);
    } finally {
      process.env = previo;
    }
  });
});
