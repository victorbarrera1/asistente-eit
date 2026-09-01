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
