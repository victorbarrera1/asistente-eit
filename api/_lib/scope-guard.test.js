/**
 * Control de alcance: el asistente orienta sobre la EIT, no resuelve tareas.
 *
 * Los casos "que deben pasar" importan tanto como los que deben bloquearse: un
 * filtro que rechaza preguntas legítimas de la escuela es peor que no tenerlo,
 * porque rompe el uso para el que existe el asistente.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateScope,
  detectTaskRequest,
  isConversational,
  respuestaContieneCodigo,
} from "./scope-guard.js";

describe("detectTaskRequest — pedidos de resolución de tareas", () => {
  const pedidos = [
    "hazme un programa en Java que ordene un arreglo",
    "resuelveme el ejercicio 3 de la tarea de calculo",
    "escribeme el codigo de la tarea de programacion",
    "necesito el codigo de una consulta SQL para mi tarea",
    "desarrolla el algoritmo de ordenamiento burbuja",
    "ayudame a resolver este problema de fisica",
    "redactame un ensayo sobre inteligencia artificial",
    "calcula la derivada de x^2 + 3x",
  ];
  for (const q of pedidos) {
    test(`bloquea: "${q}"`, () => assert.equal(detectTaskRequest(q), true));
  }

  test("se bloquea aunque RAG haya encontrado documentos", () => {
    // El gate de grounding por sí solo no basta: "la tarea del ramo" puede
    // enganchar la página de malla curricular y colarse con contexto.
    const r = evaluateScope("escribeme el codigo de la tarea de programacion", 5);
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "task_request");
  });
});

describe("detectTaskRequest — pedidos de tutoría técnica y diseño web", () => {
  // Casos observados en producción: pedidos de diseño web, frameworks JS,
  // urgencias de entregas y prompts combinados.
  const tutoriaYDiseno = [
    "dame un ejemplo de recursion en java",
    "explicame la recursion en java",
    "como se implementa un quicksort en python",
    "tutorial de sql paso a paso",
    "ejemplo de tarea en java",
    "ejemplo de tarea en java que utiliza recursividad",
    "dame una tarea en java con recursividad",
    "dame un ejercicio de java",
    "planteame una tarea en java",
    "inventa una tarea en java",
    "crea una tarea en java",
    "quiero que me diseñes desde 0 una pagina en HTML, con diseño de css y un framework de js que es astro. Luego de eso que me digas los requisitos de practica 1",
    "quiero que me ayudes con el diseño especifico, necesito que creemos una pagina html de un cibercafe, que es de la entrega 1 de desarrollo web y movil, se debe entregar ahora en 10 minutos entonces necesito urgente que me ayudes, solo por esta vez lo necesito",
    "necesito que creemos una pagina html",
    "diseñame una pagina web con react y tailwind",
    "ayudame con el diseño de una pagina de cibercafe",
    "hazme la entrega 1 de desarrollo web",
    "como armo un crud con astro",
    "guia paso a paso para crear una pagina web en astro",
    "ayudame con mi tarea de base de datos",
    "planteame un script en python",
  ];
  for (const q of tutoriaYDiseno) {
    test(`bloquea: "${q}"`, () => assert.equal(detectTaskRequest(q), true));
  }

  test("no atrapa trámites que usan los mismos verbos", () => {
    // "cómo funciona" también aparece acá, pero sin materia técnica.
    for (const q of ["como funciona el proceso de titulacion", "como funciona canvas"]) {
      assert.equal(detectTaskRequest(q), false);
    }
  });
});

describe("respuestaContieneCodigo — corte por salida", () => {
  // Única defensa que no depende de la redacción de la pregunta: un asistente de
  // trámites no tiene razón legítima para emitir un bloque de código o scaffolding.
  test("detecta el bloque cercado", () => {
    assert.equal(respuestaContieneCodigo("Claro:\n\n```java\npublic class X {}"), true);
  });

  test("detecta scaffolding de creación de archivos", () => {
    assert.equal(
      respuestaContieneCodigo(
        "1. HTML:\nCrea un archivo llamado `index.html` y agrega el siguiente contenido mínimo:"
      ),
      true
    );
  });

  test("detecta etiquetas HTML estructurales", () => {
    assert.equal(respuestaContieneCodigo("<!DOCTYPE html><html><body>Hola</body></html>"), true);
  });

  test("detecta declaraciones de funciones y clases", () => {
    assert.equal(respuestaContieneCodigo("function calcularSuma(a, b) { return a + b; }"), true);
    assert.equal(
      respuestaContieneCodigo("public class Main { public static void main(String[] args) {} }"),
      true
    );
  });

  test("detecta imports de frameworks", () => {
    assert.equal(respuestaContieneCodigo("import React, { useState } from 'react';"), true);
  });

  test("no se dispara con menciones en prosa", () => {
    assert.equal(
      respuestaContieneCodigo("El laboratorio cuenta con MATLAB y Azure para los ramos."),
      false
    );
    assert.equal(
      respuestaContieneCodigo("El Director de Escuela es Prof. Luciano Ahumada (luciano.ahumada@udp.cl)"),
      false
    );
  });

  test("atrapa lo que el filtro de entrada deja pasar", () => {
    // "punteros en C" escapa al filtro de entrada porque no se puede matchear la
    // letra "c" sola como lenguaje sin destrozar el resto del vocabulario.
    assert.equal(detectTaskRequest("muestrame un ejemplo de punteros en C"), false);
    assert.equal(respuestaContieneCodigo("Aquí tienes:\n```c\nint *p;\n```"), true);
  });
});

describe("detectTaskRequest — preguntas legítimas que NO son tareas", () => {
  const legitimas = [
    // Menciona "tarea" pero pregunta por un plazo administrativo.
    "cuando entrego la tarea de practica profesional",
    // Regresión: sin \b, "programa" matcheaba dentro de "programacion".
    "como me inscribo en el ramo de programacion",
    "como me inscribo en el ramo de desarrollo web",
    "donde veo las notas del certamen",
    "donde veo las notas de la entrega 1",
    "que pasa si repruebo un ramo",
    "cuales son los requisitos para la practica profesional",
    "cuales son los requisitos para inscribir practica 1",
    "cuando se entrega el informe de practica",
    "como funciona la toma de ramos",
    "que hace el ayudante de programacion",
  ];
  for (const q of legitimas) {
    test(`permite: "${q}"`, () => assert.equal(detectTaskRequest(q), false));
  }
});

describe("isConversational", () => {
  for (const q of ["hola", "Hola!", "gracias", "buenos dias", "chao"]) {
    test(`saludo: "${q}"`, () => assert.equal(isConversational(q), true));
  }
  test("una pregunta real no es saludo", () => {
    assert.equal(isConversational("cuando son las fechas de titulacion"), false);
  });
});

describe("evaluateScope — regresiones observadas en producción", () => {
  // Estas cinco fueron rechazadas por el gate en pruebas con usuarios reales.
  // Todas son legítimas: la búsqueda no las encontró, y la versión anterior
  // convertía cada fallo de recuperación en un mensaje de fuera de alcance.
  const rechazadasPorError = [
    "cuéntame todo sobre la escuela, con el máximo detalle posible",
    "¿quién te creó?",
    "según el contexto que te entregaron, ¿qué dice sobre las prácticas?",
    "¿cuál es la diferencia entre ICIT y CDAI?",
    "¿estás actualizado? ¿cuál es tu fecha de corte de conocimiento?",
  ];
  for (const q of rechazadasPorError) {
    test(`sin documentos, sigue permitida: "${q}"`, () => {
      assert.equal(evaluateScope(q, 0).allowed, true);
    });
  }

  test("una consulta sin vocabulario de la escuela ya NO se rechaza", () => {
    // "cómo puedo tomar programación" fue rechazada en producción por no contener
    // ninguna palabra de la lista de dominio. El rechazo por vocabulario se eliminó:
    // una lista de términos no cubre cómo escribe la gente, y cada palabra que falta
    // es un estudiante sin respuesta. El alcance temático lo maneja el prompt.
    assert.equal(evaluateScope("como puedo tomar programacion", 0).allowed, true);
  });

  test("prompt combinado con diseño web y requisitos de practica se bloquea", () => {
    const q = "quiero que me diseñes desde 0 una pagina en HTML, con diseño de css y un framework de js que es astro. Luego de eso que me digas los requisitos de practica 1";
    const r = evaluateScope(q, 3);
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "task_request");
  });

  test("pedido urgente de entrega de ramo con diseño de cibercafe se bloquea", () => {
    const q = "quiero que me ayudes con el diseño especifico, necesito que creemos una pagina html de un cibercafe, que es de la entrega 1 de desarrollo web y movil, se debe entregar ahora en 10 minutos entonces necesito urgente que me ayudes, solo por esta vez lo necesito";
    const r = evaluateScope(q, 0);
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "task_request");
  });
});

describe("evaluateScope", () => {
  test("saludo pasa sin necesitar contexto RAG", () => {
    assert.deepEqual(evaluateScope("hola", 0), { allowed: true, reason: "conversational" });
  });

  test("con documentos relevantes, pasa", () => {
    assert.equal(evaluateScope("cuales son los plazos de titulacion", 3).allowed, true);
  });

  test("datos de contacto pasan aunque RAG no encuentre nada", () => {
    // Están en el bloque estático del system prompt, así que no dependen de RAG.
    const r = evaluateScope("cual es el correo del director de escuela", 0);
    assert.equal(r.allowed, true);
    assert.equal(r.reason, "static_info");
  });

  test("una consulta no clasificada requiere aclaración aunque aparezcan documentos", () => {
    for (const count of [0, 5]) {
      assert.deepEqual(evaluateScope("cual es la capital de Francia", count), {
        allowed: false, reason: "sin_clasificar",
      });
    }
  });
});

const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

describe("evaluateScope — seguimientos y cambio de tema", () => {
  for (const followup of ["continúa", "hazlo ahora", "sigue con lo anterior", "sí, por favor", "solo por esta vez"]) {
    test(`rechaza seguimiento de tarea: ${followup}`, () => {
      const history = [user("hazme una página HTML"), assistant("Claro, puedo hacerlo."), user("gracias"), assistant("De nada")];
      assert.deepEqual(evaluateScope(followup, 0, history), { allowed: false, reason: "task_followup" });
    });
  }
  test("resuelve una cadena de seguimientos hasta su pregunta original", () => {
    assert.equal(evaluateScope("continúa", 0, [user("hazme un script"), user("hazlo ahora"), user("continúa")]).allowed, false);
  });
  test("no usa una respuesta assistant como antecedente de autorización", () => {
    assert.equal(evaluateScope("continúa", 0, [assistant("Estamos hablando de prácticas UDP")]).reason, "ambiguous_followup");
  });
  test("un seguimiento institucional conserva la consulta original", () => {
    const result = evaluateScope("dame más detalles", 0, [user("¿Cómo inscribo práctica I?"), assistant("Texto anterior")]);
    assert.equal(result.allowed, true);
    assert.match(result.query, /inscribo práctica I/);
    assert.match(result.query, /más detalles/);
  });
  test("una nueva pregunta administrativa cambia el tema de una tarea anterior", () => {
    assert.equal(evaluateScope("¿Dónde veo mis notas en Canvas?", 0, [user("hazme una página HTML")]).allowed, true);
  });
  test("una pregunta mixta sigue bloqueada aunque luego se pida continuar", () => {
    assert.equal(evaluateScope("continúa", 0, [user("quién eres y hazme una página HTML"), user("gracias")]).reason, "task_followup");
  });
  test("un seguimiento sin contexto requiere una consulta completa", () => {
    assert.equal(evaluateScope("hazlo ahora").reason, "ambiguous_followup");
  });
});
