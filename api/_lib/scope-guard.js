/**
 * Control de alcance del asistente.
 *
 * El system prompt ya prohíbe resolver tareas (regla 7), pero una instrucción no
 * es un mecanismo: el chat llamaba al modelo aunque RAG no hubiera encontrado
 * nada, así que ante "resuélveme este ejercicio" el contexto quedaba vacío y
 * Llama respondía con su conocimiento propio. Este módulo convierte esa regla en
 * algo que se hace cumplir del lado del servidor, antes de gastar GPU.
 *
 * Dos capas, en este orden:
 *   1. detectTaskRequest() — pedidos de tarea explícitos, incluso si RAG enganchó
 *      algo (ej. "hazme el código de la tarea del ramo" puede matchear la malla).
 *   2. El gate de grounding en chat-handler — sin documentos EIT relevantes no se
 *      responde libremente.
 *
 * Ninguna de las dos reemplaza al system prompt: son defensa en profundidad.
 */

/** Respuesta única para todo lo que queda fuera de alcance. */
export const OUT_OF_SCOPE_REPLY =
  "Mi rol como **Asistente EIT UDP** es orientarte en trámites, reglamentos, " +
  "prácticas, titulación, ayudantías y servicios universitarios de la Escuela. " +
  "No resuelvo tareas ni ejercicios de asignaturas.\n\n" +
  "Si tu duda es sobre la EIT y no la encontré, escríbele a **Secretaría de Estudios** " +
  "(ximena.geoffroy@udp.cl) o revisa https://eit.udp.cl\n\n" +
  "[SUGERENCIAS]\n" +
  "- ¿Cuáles son los requisitos para inscribir la práctica?\n" +
  "- ¿Qué plazos tiene el proceso de titulación?";

// Homóglifos: letras cirílicas y griegas visualmente idénticas a las latinas.
// "hаzme" con la а cirílica (U+0430) se ve igual pero no matchea ningún patrón,
// y evadía el filtro por completo.
const HOMOGLIFOS = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  һ: "h",
  ν: "v",
  м: "m",
  т: "t",
  в: "b",
  н: "h",
  к: "k",
  α: "a",
  ε: "e",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  κ: "k",
  ι: "i",
};

/**
 * Normaliza el mensaje antes de aplicar los patrones.
 *
 * Además de minúsculas y tildes, neutraliza tres evasiones que se verificaron
 * funcionando contra el filtro: caracteres de ancho cero intercalados entre
 * letras, homóglifos cirílicos/griegos, y formas de ancho completo. Las tres
 * producen un texto que el estudiante lee igual pero el regex no reconoce.
 */
function normalize(text) {
  return (
    (text || "")
      // NFKC convierte las formas de ancho completo (ｈ) a su equivalente ASCII.
      .normalize("NFKC")
      .toLowerCase()
      // Caracteres invisibles: ancho cero, unión/separación y guion suave.
      .replace(/[​-‍⁠﻿­]/g, "")
      .replace(/[а-яα-ω]/g, (c) => HOMOGLIFOS[c] ?? c)
      // Separa los diacríticos y los elimina.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
  );
}

// Saludos y cortesías: no requieren contexto RAG, así que no deben pasar por el
// gate de grounding ni recibir el mensaje de fuera de alcance.
const CONVERSATIONAL_REGEX =
  /^(hola+|buenas?|buenos? dias|buenas? tardes|buenas? noches|hey|que tal|como estas|quien eres|que eres|que haces|que puedes hacer|en que me puedes ayudar|ayuda|gracias|muchas gracias|ok|oka|vale|perfecto|entendido|listo|genial|chao|adios|nos vemos|bye)[\s!.?¡¿]*$/;

// Preguntas que el system prompt puede responder por sí solo (bloque de contacto
// y datos generales), aunque RAG no devuelva nada. Sin esta excepción el gate
// rechazaría "¿cuál es el correo del director?", que sí debe responderse.
const STATIC_INFO_REGEX =
  /(correo|email|mail|contacto|telefono|fono|direccion|donde queda|donde esta|ubicacion|quien es|director|directora|secretaria|coordinador|jefe de carrera|sitio web|pagina web)/;

/**
 * Pedidos de resolución de tareas.
 *
 * Se exige verbo de acción + objeto académico en la MISMA consulta. Pedir solo
 * "código" o solo "tarea" no basta: "¿cuándo se entrega la tarea de práctica?"
 * y "¿dónde veo las notas del ramo?" son preguntas legítimas de la escuela.
 */
// Los \b son necesarios: sin ellos "programa" matchea dentro de "programacion" y
// "¿cómo me inscribo en el ramo de programación?" quedaba clasificada como tarea.
// Por lo mismo "programa" no está como verbo (es ambiguo con el sustantivo);
// solo la forma inequívoca "programame".
const ACTION_VERBS =
  /\b(resuelve|resuelveme|resolver|haz|hazme|haceme|hazlo|hacer|desarrolla|desarrollame|desarrollar|escribe|escribeme|escribir|programame|programar|implementa|implementame|implementar|codifica|codificame|codificar|calcula|calculame|calcular|demuestra|demuestrame|demostrar|corrige|corrigeme|corregir|completa|completame|completar|redacta|redactame|redactar|traduce|traduceme|traducir|crea|creame|crear|genera|generame|generar|inventa|inventame|inventar|plantea|planteame|plantear|propon|proponme|proponer|dame|da|pasa|pasame|dame el codigo|dame codigo|dame la solucion|dame la respuesta|necesito el codigo|necesito codigo|como se hace este|como resuelvo este|ayudame a resolver|ayudame con mi tarea|ayudame con la tarea|hazme la tarea)\b/;

const ACADEMIC_OBJECTS =
  /\b(tarea|tareas|ejercicio|ejercicios|problema|problemas|codigo|programa|script|funcion|algoritmo|consulta sql|query|ensayo|redaccion|integral|derivada|ecuacion|ecuaciones|matriz|matrices|circuito|guia de ejercicios)\b/;

// Lenguajes y materias técnicas: "en Python", "de cálculo", conceptos como "recursividad".
const TECHNICAL_SUBJECTS =
  /\b(python|java|javascript|typescript|c\+\+|c#|sql|html|css|php|ruby|matlab|assembler|verilog|vhdl|calculo|algebra|fisica|estadistica|termodinamica|electromagnetismo|recursividad|recursion|recursiv[oa]s?)\b/;

/**
 * ¿Es un pedido de resolver una tarea o tutoría técnica?
 *
 * Requiere verbo de acción o enseñanza y, además, objeto académico o materia técnica.
 */
const EXPLAIN_VERBS =
  /\b(explica|explicame|explicar|ensena|ensename|ensenar|muestra|muestrame|mostrar|dame un ejemplo|dame ejemplos|(un )?ejemplos? (de|en|con|sobre)|(un )?ejercicios? (de|en|con|sobre)|como funciona|como se hace|como se implementa|como se programa|como se escribe|como se declara|como hago un|como creo un|tutorial|paso a paso)\b/;

export function detectTaskRequest(message) {
  const q = normalize(message);
  if (!q || q.length < 8) return false;

  // Vía 1: pedir que produzca, cree, plantee o resuelva el trabajo.
  if (ACTION_VERBS.test(q) && (ACADEMIC_OBJECTS.test(q) || TECHNICAL_SUBJECTS.test(q))) {
    return true;
  }

  // Vía 2: pedir clases, tutoriales o ejemplos de materias técnicas o ejercicios.
  if (EXPLAIN_VERBS.test(q) && (TECHNICAL_SUBJECTS.test(q) || ACADEMIC_OBJECTS.test(q))) {
    return true;
  }

  return false;
}

/**
 * ¿La respuesta que está generando el modelo es código?
 *
 * Última línea de defensa, y la única que no depende de cómo esté redactada la
 * pregunta. Enumerar las formas de pedir una tarea no converge —ya falló con
 * "dame un ejemplo de recursión en Java"—, pero la salida sí tiene un invariante
 * claro: un asistente de trámites de la EIT no tiene ninguna razón legítima para
 * emitir un bloque de código. El corpus no contiene código.
 *
 * Se dispara con el bloque cercado de Markdown, que es como los modelos entregan
 * código. Menciones en prosa ("el laboratorio tiene MATLAB") no lo activan.
 */
export function respuestaContieneCodigo(textoAcumulado) {
  return /```/.test(textoAcumulado);
}

/** Mensaje que reemplaza a una respuesta que empezó a entregar código. */
export const CODIGO_INTERCEPTADO_REPLY =
  "\n\n---\n\n⚠️ Detuve esta respuesta: no entrego código ni resuelvo ejercicios de " +
  "asignaturas. Mi rol es orientarte en trámites, reglamentos, prácticas, titulación " +
  "y servicios de la Escuela.\n\nPara dudas de programación, habla con el ayudante o " +
  "el profesor de tu ramo.";

/** Saludo o cortesía: se responde sin exigir contexto RAG. */
export function isConversational(message) {
  return CONVERSATIONAL_REGEX.test(normalize(message));
}

/** Consulta resoluble con el bloque de contacto del system prompt. */
export function isStaticInfoQuery(message) {
  return STATIC_INFO_REGEX.test(normalize(message));
}

// Preguntas sobre el asistente mismo. El prompt de sistema las cubre (reglas de
// identidad y de no mencionar fecha de corte), pero no dependen de RAG, así que
// sin esta excepción "¿quién te creó?" caía como consulta sin respaldo.
const META_REGEX =
  /\b(quien (eres|te creo|te credo|te hizo|te desarrollo|te programo)|que eres|como funcionas|estas actualizado|fecha de corte|eres (una )?(ia|inteligencia artificial|bot|robot)|te actualizan|como te actualizas|para que sirves|que puedes hacer|cual es tu nombre|como te llamas)\b/;

/** Pregunta sobre el asistente mismo, respondible desde el prompt de sistema. */
export function isMetaQuery(message) {
  return META_REGEX.test(normalize(message));
}

// Vocabulario del mundo de la escuela. Se usa para distinguir "pregunta de la EIT
// que la búsqueda no supo encontrar" de "pregunta que no tiene nada que ver".
// Es deliberadamente amplio: el costo de un falso positivo acá es bajo (el modelo
// dirá que no tiene el dato), y el de un falso negativo es rechazar a un estudiante.
const DOMAIN_REGEX =
  /\b(eit|udp|icit|cdai|escuela|facultad|universidad|carrera|ramo|ramos|malla|asignatura|asignaturas|curso|cursos|practica|practicas|titulacion|titular|titulo|grado|egreso|egresado|tesis|memoria|capstone|ayudantia|ayudantias|ayudante|reglamento|reglamentos|laboratorio|laboratorios|beca|becas|tne|dae|gratuidad|matricula|arancel|semestre|semestres|certamen|control|nota|notas|profe|profesor|profesora|academico|academicos|docente|alumno|alumnos|estudiante|estudiantes|acreditacion|acreditada|admision|convalidar|convalidacion|inscribir|inscripcion|secretaria|coordinador|director|directora|campus|sala|salas|horario|horarios|calendario|credito|creditos|informatica|telecomunicaciones|concurso|concursos|seminario|seminarios|investigacion|vinculacion|udpiler|canvas|portal|biblioteca|psicologo|psicologa|bienestar|salud mental|comite|intercambio|magister|postgrado|diplomado|infraestructura|equipo|equipos|software|matlab|azure|bizagi)\b/;

/** ¿La consulta pertenece al mundo de la escuela, aunque RAG no haya encontrado nada? */
export function isOnTopic(message) {
  return DOMAIN_REGEX.test(normalize(message));
}

/**
 * Decide si la consulta puede responderse.
 *
 * @param {string} message - Último mensaje del usuario.
 * @param {number} foundDocsCount - Documentos EIT relevantes recuperados por RAG.
 * @returns {{allowed: true, reason: string} | {allowed: false, reason: string}}
 */
export function evaluateScope(message, foundDocsCount) {
  // Un pedido de tarea se rechaza aunque RAG haya enganchado algo: es
  // justamente el caso que el gate de grounding por sí solo deja pasar.
  if (detectTaskRequest(message)) {
    return { allowed: false, reason: "task_request" };
  }

  if (isConversational(message)) {
    return { allowed: true, reason: "conversational" };
  }

  if (isMetaQuery(message)) {
    return { allowed: true, reason: "meta" };
  }

  if (foundDocsCount > 0) {
    return { allowed: true, reason: "grounded" };
  }

  if (isStaticInfoQuery(message)) {
    return { allowed: true, reason: "static_info" };
  }

  if (isOnTopic(message)) {
    return { allowed: true, reason: "on_topic_sin_contexto" };
  }

  // Todo lo demás también pasa, y esto es deliberado.
  //
  // Hasta acá había un rechazo por "fuera de tema" basado en vocabulario, y falló
  // dos veces seguidas con preguntas legítimas: primero las que la búsqueda no
  // encontraba, después "cómo puedo tomar programación", que no usa ninguna de las
  // palabras esperadas. Una lista de términos nunca va a cubrir cómo escribe la
  // gente, y cada palabra que falta es un estudiante rechazado.
  //
  // La asimetría manda: rechazar una consulta válida deja al estudiante sin
  // respuesta, mientras que dejar pasar una fuera de tema solo produce un "no tengo
  // información oficial sobre eso" — que para una pregunta ajena a la Escuela es
  // exactamente lo que corresponde responder.
  //
  // Lo único que se bloquea de forma determinista es el pedido de tarea, arriba.
  // Ese SÍ tiene que ser código: se intentó dejarlo en manos del prompt y el modelo
  // no lo respetó. El alcance temático, en cambio, es un juicio blando y el prompt
  // lo maneja mejor que una lista de palabras.
  return { allowed: true, reason: "sin_clasificar" };
}
