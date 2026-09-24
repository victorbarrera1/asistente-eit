import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectEvidenceUrls,
  filterOutputLinks,
  isInstitutionalUrl,
  OMITTED_LINK,
} from "./output-links.js";

const evidence = collectEvidenceUrls([
  { url: "https://eit.udp.cl/practicas/", contenido: "Formulario en https://forms.gle/abc123." },
]);

test("conserva dominios UDP y enlaces presentes en la evidencia", () => {
  const text = "Revisa https://eit.udp.cl/practicas/ y el [formulario](https://forms.gle/abc123).";
  assert.deepEqual(filterOutputLinks(text, evidence), { text, removed: 0 });
});

test("omite enlaces inventados, en markdown y sueltos, conservando el texto", () => {
  const { text, removed } = filterOutputLinks(
    "Ingresa [aquí](https://udp-login.com/verificar) o en https://evil.example/x.",
    evidence,
  );
  assert.equal(removed, 2);
  assert.equal(text, `Ingresa aquí ${OMITTED_LINK} o en ${OMITTED_LINK}.`);
});

test("no se deja engañar por hosts parecidos ni credenciales en la URL", () => {
  assert.equal(isInstitutionalUrl("https://udp.cl.evil.com/"), false);
  assert.equal(isInstitutionalUrl("https://fakeudp.cl/"), false);
  assert.equal(isInstitutionalUrl("https://eit.udp.cl@evil.com/"), false);
  assert.equal(isInstitutionalUrl("https://user:pw@eit.udp.cl/"), false);
  assert.equal(isInstitutionalUrl("https://dae.udp.cl/tne"), true);
});
