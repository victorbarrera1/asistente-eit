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
  "No entrego código, tutorías ni soluciones de tareas. Para contenidos de una " +
  "asignatura, consulta al profesor o ayudante.\n\n" +
  "Si también tienes una consulta sobre un trámite de la EIT, hazla por separado.";

export const CLARIFICATION_REPLY =
  "¿Sobre qué trámite o plataforma de la EIT UDP necesitas orientación? " +
  "Escribe la consulta completa para poder identificarla. Puedo ayudarte con " +
  "prácticas, titulación, inscripción de ramos y servicios universitarios.";

export const INSUFFICIENT_EVIDENCE_REPLY =
  "No encontré información oficial suficiente para responder esa consulta. " +
  "Puedes precisar el trámite, la carrera o la malla, o consultar directamente " +
  "a la Escuela en https://eit.udp.cl.";

export const CONVERSATIONAL_REPLY =
  "Soy el Asistente EIT UDP. Puedo orientarte en trámites, reglamentos y uso " +
  "administrativo de las plataformas universitarias. ¿Qué necesitas consultar?";

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
 * Pedidos de resolución de tareas o desarrollo de software/páginas/código.
 *
 * Se exige verbo de acción + objeto académico en la MISMA consulta. Pedir solo
 * "código" o solo "tarea" no basta: "¿cuándo se entrega la tarea de práctica?"
 * y "¿dónde veo las notas del ramo?" son preguntas legítimas de la escuela.
 */
// Los \b son necesarios: sin ellos "programa" matchea dentro de "programacion" y
// "¿cómo me inscribo en el ramo de programación?" quedaba clasificada como tarea.
// Por lo mismo "programa" no está como verbo aislado; solo formas inequívocas.
const ACTION_VERBS =
  /\b(resuelve|resuelveme|resolver|resolvamos|resuelvas?|haz|hazme|haceme|hazlo|hacer|hagamos|hagas?|desarrolla|desarrollame|desarrollar|desarrollemos|desarrolles?|escribe|escribeme|escribir|escribamos|escribas?|programame|programar|programemos|programes?|disena|disename|disenes?|disenar|disenemos|diseno|construye|construyeme|construir|construyamos|construyas?|arma|armame|armar|armemos|armes?|maqueta|maquetame|maquetar|maquetemos|maquetes?|implementa|implementame|implementar|implementemos|implementes?|codifica|codificame|codificar|codifiquemos|codifiques?|calcula|calculame|calcular|calculemos|calcules?|demuestra|demuestrame|demostrar|corrige|corrigeme|corregir|corrijamos|corrijas?|completa|completame|completar|completemos|completes?|redacta|redactame|redactar|redactemos|redactes?|traduce|traduceme|traducir|traduzcamos|traduzcas?|crea|creame|crear|creemos|crees?|genera|generame|generar|generemos|generes?|inventa|inventame|inventar|inventemos|inventes?|plantea|planteame|plantear|planteemos|plantees?|propon|proponme|proponer|propongamos|propongas?|dame|da|pasa|pasame|pasanos|entregame|entreganos|ayuda|ayudame|ayudame a|ayudame con|ayudes|ayudes con|apoyame con|dame el codigo|dame codigo|dame la solucion|dame la respuesta|necesito el codigo|necesito codigo|necesito que|quiero que|como se hace este|como resuelvo este|ayudame a resolver|ayudame con mi tarea|ayudame con la tarea|hazme la tarea|hazme la entrega|hazme el proyecto)\b/;

const ACADEMIC_OBJECTS =
  /\b(tarea|tareas|ejercicio|ejercicios|problema|problemas|codigo|programa|programas|script|scripts|funcion|funciones|algoritmo|algoritmos|consulta sql|query|queries|ensayo|ensayos|redaccion|integral|integrales|derivada|derivadas|ecuacion|ecuaciones|matriz|matrices|circuito|circuitos|guia de ejercicios|laboratorio|laboratorios|taller|talleres|proyecto|proyectos|entrega|entregas|entrega \d+|informe|informes|avance|avances|pagina web|pagina html|sitio web|pagina|web|app|aplicacion|aplicaciones|backend|frontend|api|apis|base de datos|bases de datos|interfaz|interfaces|mockup|mockups|wireframe|wireframes|software|sistema|sistemas|cibercafe|calculadora|formulario|login|crud|endpoint|endpoints)\b/;

// Lenguajes, frameworks y materias técnicas: "en Python", "de cálculo", conceptos como "recursividad".
const TECHNICAL_SUBJECTS =
  /\b(python|java|javascript|typescript|c\+\+|c#|sql|html|css|php|ruby|matlab|assembler|assembly|verilog|vhdl|astro|react|vue|angular|svelte|next\.?js|nuxt|node\.?js|nodejs|express|django|flask|fastapi|spring|spring boot|laravel|bootstrap|tailwind|sass|scss|jquery|prisma|typeorm|mongoose|calculo|algebra|fisica|estadistica|termodinamica|electromagnetismo|recursividad|recursion|recursiv[oa]s?|desarrollo web|desarrollo movil|programacion web|programacion movil|ingenieria de software|estructuras? de datos|bases? de datos|redes|sistemas operativos|arquitectura de computadores|inteligencia artificial|machine learning|deep learning)\b/;

/**
 * ¿Es un pedido de resolver una tarea o tutoría técnica / guía de desarrollo?
 *
 * Requiere verbo de acción o enseñanza y, además, objeto académico o materia técnica.
 */
const EXPLAIN_VERBS =
  /\b(explica|explicame|explicar|ensena|ensename|ensenar|muestra|muestrame|mostrar|dame un ejemplo|dame ejemplos|(un )?ejemplos? (de|en|con|sobre)|(un )?ejercicios? (de|en|con|sobre)|como funciona|como se hace|como se implementa|como se programa|como se escribe|como se declara|como hago un[a]?|como creo un[a]?|como diseno|como armo|como construyo|como maquetar?|tutorial|paso a paso|guia para|guia de|guia basica|guia general|plantilla|boilerplate|scaffold|scaffolding|esqueleto)\b/;

export function detectTaskRequest(message) {
  const q = normalize(message);
  if (!q || q.length < 8) return false;

  // Vía 1: pedir que produzca, cree, plantee, diseñe o resuelva el trabajo.
  if (ACTION_VERBS.test(q) && (ACADEMIC_OBJECTS.test(q) || TECHNICAL_SUBJECTS.test(q))) {
    return true;
  }

  // Vía 2: pedir clases, tutoriales, guías o ejemplos de materias técnicas o ejercicios.
  if (EXPLAIN_VERBS.test(q) && (TECHNICAL_SUBJECTS.test(q) || ACADEMIC_OBJECTS.test(q))) {
    return true;
  }

  return false;
}

/**
 * ¿La respuesta que está generando el modelo es código o scaffolding de desarrollo?
 *
 * Última línea de defensa, y la única que no depende de cómo esté redactada la
 * pregunta. Enumerar las formas de pedir una tarea no converge —ya falló con
 * "dame un ejemplo de recursión en Java"—, pero la salida sí tiene un invariante
 * claro: un asistente de trámites de la EIT no tiene ninguna razón legítima para
 * emitir un bloque de código o instrucciones de scaffolding de archivos. El corpus no contiene código.
 *
 * Se dispara con bloques cercados de Markdown, etiquetas estructurales HTML, declaraciones
 * de código o instrucciones de creación de archivos de programación.
 */
const CODE_OUTPUT_REGEX =
  /(```|<!doctype html>|<\/?html[\s>]|<\/?head[\s>]|<\/?body[\s>]|<\/?script[\s>]|\bpublic\s+class\s+\w+|\bpublic\s+static\s+void\s+main|\bdef\s+\w+\s*\(|\bfunction\s+\w+\s*\(|\bimport\s+React|\bimport\s+.*from\s+['"]|crea un archivo llamado\s+[`'"]?\w+\.(html|css|js|ts|py|java|cpp|c|php|astro|sql)[`'"]?)/i;

export function respuestaContieneCodigo(textoAcumulado) {
  return CODE_OUTPUT_REGEX.test(textoAcumulado);
}

/** Mensaje que reemplaza a una respuesta que empezó a entregar código. */
export const CODIGO_INTERCEPTADO_REPLY =
  OUT_OF_SCOPE_REPLY;

/** Cubre guías técnicas en prosa, además del detector de sintaxis de código. */
export function respuestaFueraDeAlcance(text) {
  if (respuestaContieneCodigo(text)) return true;
  const q = normalize(text);
  return (
    TECHNICAL_SUBJECTS.test(q) &&
    /\b(aqui tienes|te (doy|dejo|muestro)|guia (basica|general|paso a paso)|tutorial|ejemplo de codigo|crea un archivo|crea una pagina|define los estilos)\b/.test(q)
  );
}

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
  const q = normalize(message);
  return DOMAIN_REGEX.test(q) || /\btomar\s+(?:el\s+)?programacion\b/.test(q);
}

/** Seguimientos sin tema propio: necesitan una consulta anterior identificable. */
export function isGenericFollowUp(message) {
  const q = normalize(message).replace(/^[¿¡\s]+|[.!?\s]+$/g, "");
  return /^(?:(?:si|ok|bueno|por favor)[,\s]+)?(?:continua(?:r)?|sigue|sigamos|prosigue|hazlo|hazlo ahora|hazlo de nuevo|hazlo igual|hazlo por favor|continua con lo anterior|continua por favor|sigue con lo anterior|puedes continuar|puedes seguir|puedes hacerlo|y luego|y despues|y ahora|y para la segunda|y para la otra|dame mas detalles|explicame mas|solo por esta vez|si,? por favor)(?:[,\s]+por favor)?$/.test(q);
}

/**
 * Decide si la consulta puede responderse.
 *
 * @param {string} message - Último mensaje del usuario.
 * @param {number} [_foundDocsCount] - Compatibilidad: los documentos NO autorizan la intención.
 * @param {Array<{role: string, content: string}>} [recentHistory] - Mensajes previos al actual.
 * @returns {{allowed: true, reason: string} | {allowed: false, reason: string}}
 */
export function evaluateScope(message, _foundDocsCount = 0, recentHistory = []) {
  // Un pedido de tarea se rechaza aunque RAG haya enganchado algo: es
  // justamente el caso que el gate de grounding por sí solo deja pasar.
  if (detectTaskRequest(message)) {
    return { allowed: false, reason: "task_request" };
  }

  if (isGenericFollowUp(message)) {
    // Se revisa todo el historial ya acotado por MAX_MESSAGES, antes del recorte
    // de caracteres. No se confía en un texto de rechazo de role=assistant.
    for (let i = recentHistory.length - 1; i >= 0; i--) {
      const prior = recentHistory[i];
      if (prior.role !== "user" || isGenericFollowUp(prior.content)) continue;
      const anchor = evaluateScope(prior.content);
      if (anchor.reason === "conversational" || anchor.reason === "meta") continue;
      if (!anchor.allowed) {
        return {
          allowed: false,
          reason: anchor.reason === "task_request" ? "task_followup" : "ambiguous_followup",
        };
      }
      return {
        allowed: true,
        reason: "contextual_followup",
        query: `${prior.content}\nConsulta de seguimiento: ${message}`,
      };
    }
    return { allowed: false, reason: "ambiguous_followup" };
  }

  if (isConversational(message)) {
    return { allowed: true, reason: "conversational" };
  }

  if (isMetaQuery(message)) {
    return { allowed: true, reason: "meta" };
  }

  if (isStaticInfoQuery(message) && isOnTopic(message)) {
    return { allowed: true, reason: "static_info" };
  }

  if (isOnTopic(message)) {
    return { allowed: true, reason: "on_topic_sin_contexto" };
  }

  // No reconocer una consulta requiere aclaración, no autorización implícita.
  return { allowed: false, reason: "sin_clasificar" };
}
