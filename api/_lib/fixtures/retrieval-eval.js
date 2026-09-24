/**
 * Conjunto SEMILLA para evaluar la recuperación (scripts/eval-retrieval.js).
 *
 * Procedencia: redactado a partir de los títulos de las páginas de PAGES
 * (api/_lib/scrape.js) y de consultas típicas de trámites. La etiqueta es la URL
 * donde un humano esperaría encontrar la respuesta. NO está validado por la
 * Escuela: sirve para comparar configuraciones (semántica vs. híbrida, umbrales,
 * chunking) entre sí, no como medida absoluta. El conjunto definitivo de 200
 * consultas de la Etapa 0 debe reemplazarlo, con etiquetas revisadas por personas
 * responsables del servicio.
 *
 * Mezcla a propósito formulaciones formales, coloquiales chilenas y términos
 * exactos (siglas, nombres), que es donde la búsqueda léxica debería ayudar.
 */
const EIT = "https://eit.udp.cl";

export const RETRIEVAL_CASES = [
  {
    id: "toma-ramos-1",
    query: "¿Cómo tomo ramos este semestre?",
    expected: ["https://estudiantes.udp.cl/servicios-academicos/toma-de-ramos/"],
  },
  {
    id: "toma-ramos-2",
    query: "inscripción de asignaturas fechas",
    expected: [
      "https://estudiantes.udp.cl/servicios-academicos/toma-de-ramos/",
      "https://www.udp.cl/calendario-academico/",
    ],
  },
  {
    id: "calendario",
    query: "¿cuándo empiezan las vacaciones de invierno?",
    expected: ["https://www.udp.cl/calendario-academico/"],
  },
  {
    id: "practica-1",
    query: "requisitos para hacer la práctica profesional",
    expected: [`${EIT}/asuntos-estudiantiles/practicas/`],
  },
  {
    id: "practica-2",
    query: "como inscribo la practica",
    expected: [`${EIT}/asuntos-estudiantiles/practicas/`],
  },
  {
    id: "titulacion",
    query: "¿qué necesito para titularme?",
    expected: [`${EIT}/asuntos-estudiantiles/titulacion/`],
  },
  {
    id: "reglamento",
    query: "reglamento de la carrera",
    expected: [`${EIT}/asuntos-estudiantiles/reglamentos/`],
  },
  {
    id: "ayudantias",
    query: "cómo postulo a ser ayudante",
    expected: [`${EIT}/asuntos-estudiantiles/ayudantias/`],
  },
  {
    id: "malla-icit",
    query: "malla curricular de ICIT",
    expected: [`${EIT}/carrera-udp/malla-curricular/`, `${EIT}/asignaturas/`],
  },
  {
    id: "malla-cdai",
    query: "malla de ciencia de datos e inteligencia artificial",
    expected: [`${EIT}/malla-curricular-2/`, `${EIT}/asignaturas-2/`],
  },
  {
    id: "duracion",
    query: "¿cuántos años dura ingeniería civil en informática y telecomunicaciones?",
    expected: [
      `${EIT}/carrera-udp/duracion/`,
      "https://admision.udp.cl/carrera/ingenieria-civil-en-informatica-y-telecomunicaciones/",
    ],
  },
  {
    id: "ponderaciones",
    query: "ponderaciones PAES para entrar a CDAI",
    expected: [
      "https://admision.udp.cl/carrera/ingenieria-civil-en-ciencia-de-datos-e-inteligencia-artificial/",
    ],
  },
  {
    id: "tne",
    query: "¿dónde renuevo la TNE?",
    expected: ["https://dae.udp.cl/bienestar-estudiantil/tarjeta-nacional-estudiantil-tne/"],
  },
  {
    id: "psicologo",
    query: "necesito hablar con un psicólogo de la u",
    expected: [
      "https://dae.udp.cl/salud-mental-estudiantil/atencion-individual/",
      "https://dae.udp.cl/salud-mental-estudiantil/",
    ],
  },
  {
    id: "tutorias",
    query: "tutorías académicas para ramos difíciles",
    expected: [`${EIT}/nuestra-escuela/tutorias-academicas/`],
  },
  { id: "ieee", query: "rama IEEE", expected: [`${EIT}/vinculacion-con-el-medio/rama-ieee-udp/`] },
  { id: "udpiler", query: "qué es UDPiler", expected: [`${EIT}/asuntos-estudiantiles/udpiler/`] },
  {
    id: "intercambio",
    query: "intercambio estudiantil en el extranjero",
    expected: [`${EIT}/vinculacion-con-el-medio/internacionalizacion/`],
  },
  {
    id: "acreditacion",
    query: "¿la carrera está acreditada? por cuántos años",
    expected: [`${EIT}/carrera-udp/acreditacion/`],
  },
  {
    id: "manuales",
    query: "manual para conectarme al wifi o a los laboratorios",
    expected: [
      `${EIT}/asuntos-estudiantiles/herramientas-y-manuales/`,
      `${EIT}/asuntos-estudiantiles/sitios-internos/`,
    ],
  },
];
