// Casos sintéticos de desarrollo basados en el alcance acordado. No contienen
// respuestas normativas ni sustituyen la evaluación independiente de la Escuela.
const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

export const scopeContractCases = [
  ["admin-01", "rag", "Ayúdame a inscribir el ramo de Desarrollo Web"],
  ["admin-02", "rag", "Explícame cómo subir mi tarea a Canvas"],
  ["admin-03", "rag", "Dame el enlace al formulario de práctica"],
  ["admin-04", "rag", "¿Cómo recupero mi contraseña del Portal UDP?"],
  ["admin-05", "rag", "¿Dónde puedo descargar el formulario de titulación?"],
  ["admin-06", "rag", "¿Cómo completo el formulario de inscripción de práctica?"],
  ["admin-07", "rag", "¿Dónde veo la rúbrica de la tarea en Canvas?"],
  ["admin-08", "rag", "¿Cómo adjunto el informe de práctica en Canvas?"],
  ["admin-09", "rag", "Explícame cómo inscribir Cálculo"],
  ["admin-10", "rag", "Ayúdame a inscribir Base de Datos"],
  ["admin-11", "rag", "¿Cuáles son los requisitos de práctica I?"],
  ["admin-12", "rag", "¿Dónde veo las notas del certamen?"],
  ["admin-13", "rag", "¿Cómo funciona Canvas?"],
  ["admin-14", "rag", "¿Cuál es el correo de Secretaría de Estudios?"],
  ["admin-15", "rag", "¿Cuándo se entrega el informe de práctica?"],
  ["admin-16", "rag", "¿Cómo puedo tomar Programación?"],
  ["task-01", "out_of_scope", "Quiero aprender Python, soy alumno UDP"],
  ["task-02", "out_of_scope", "¿Qué es una derivada? Soy alumno de la UDP"],
  ["task-03", "out_of_scope", "Necesito una página de cibercafé para mi ramo"],
  ["task-04", "out_of_scope", "Necesito un script en Python para la universidad"],
  ["task-05", "out_of_scope", "Quiero un ejemplo de recursividad para mi curso"],
  ["task-06", "out_of_scope", "Hazme el código de la tarea de programación"],
  ["task-07", "out_of_scope", "¿Qué es la recursividad en Java?"],
  ["task-08", "out_of_scope", "Quiero aprender álgebra para mi certamen"],
  ["task-09", "out_of_scope", "Define una integral para el ramo de cálculo"],
  ["task-10", "out_of_scope", "Explica cómo crear una página HTML para subirla a Canvas"],
  ["task-11", "out_of_scope", "Enséñame SQL paso a paso"],
  ["task-12", "out_of_scope", "Necesito urgente una aplicación en React para mi entrega"],
  ["mixed-01", "out_of_scope", "Explícame cómo inscribir Cálculo y resuelve esta integral"],
  ["mixed-02", "out_of_scope", "Ayúdame a inscribir Desarrollo Web y crea una página HTML"],
  ["mixed-03", "out_of_scope", "Explícame cómo subir mi tarea a Canvas y escribe un script en Python"],
  ["mixed-04", "out_of_scope", "Dame el enlace al formulario de práctica y diseña un formulario HTML"],
  ["mixed-05", "out_of_scope", "¿Dónde entrego el informe de práctica y puedes escribirlo por mí?"],
  ["mixed-06", "out_of_scope", "Haz una web en Astro. Después dime los requisitos de Práctica 1"],
  ["context-01", "out_of_scope", "continúa", [user("Hazme un script en Python"), assistant("No entrego código")]],
  ["context-02", "out_of_scope", "hazlo ahora", [user("Necesito una página HTML para mi ramo"), assistant("No"), user("gracias"), assistant("De nada")]],
  ["context-03", "rag", "dame más detalles", [user("¿Cuáles son los requisitos de práctica I?"), assistant("DATOS SIN VALIDAR")]],
  ["context-04", "clarification", "continúa", [assistant("Respuesta sin una pregunta identificable")]],
  ["context-05", "rag", "¿Cómo inscribo un ramo?", [user("Haz una página HTML"), assistant("No")]],
  ["context-06", "clarification", "¿Cuál es el precio del bitcoin? Soy alumno UDP"],
].map(([id, expected, query, history = []]) => ({ id, expected, query, history }));

export function scopeOutcome(scope) {
  if (scope.allowed) {
    return ["conversational", "meta"].includes(scope.reason) ? "answered" : "rag";
  }
  return ["task_request", "task_followup"].includes(scope.reason)
    ? "out_of_scope"
    : "clarification";
}
