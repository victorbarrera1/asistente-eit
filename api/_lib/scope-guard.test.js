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

describe("detectTaskRequest — pedidos de tutoría técnica", () => {
  // Con Qwen 2.5 el asistente entregó un programa completo de recursión en Java.
  // La redacción no usaba ningún verbo de producción ("dame un ejemplo de"), que
  // es el limite de enumerar formas de pedir: no converge.
  const tutoria = [
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
  ];
  for (const q of tutoria) {
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
  // trámites no tiene razón legítima para emitir un bloque de código.
  test("detecta el bloque cercado", () => {
    assert.equal(respuestaContieneCodigo("Claro:\n\n```java\npublic class X {}"), true);
  });

  test("no se dispara con menciones en prosa", () => {
    assert.equal(
      respuestaContieneCodigo("El laboratorio cuenta con MATLAB y Azure para los ramos."),
      false,
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
    "donde veo las notas del certamen",
    "que pasa si repruebo un ramo",
    "cuales son los requisitos para la practica profesional",
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

  test("una consulta fuera de tema ya no la bloquea el gate", () => {
    // El bloqueo por tema se movió al prompt de sistema. El gate solo corta los
    // pedidos de tarea, que es lo único que el modelo demostró no respetar por su
    // cuenta; el alcance temático lo resuelve mejor el prompt que una lista de
    // palabras, y equivocarse ahí solo produce un "no puedo ayudarte con eso".
    const r = evaluateScope("cual es la capital de Francia", 0);
    assert.equal(r.allowed, true);
    assert.equal(r.reason, "sin_clasificar");
  });
});
