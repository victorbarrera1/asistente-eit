/**
 * Lógica de scraping compartida.
 * Usada por: scripts/scrape-eit.js (manual) y api/cron-scrape.js (automático).
 *
 * Para agregar una nueva escuela/sección solo añade entradas a PAGES.
 */
import { embedTexts, getAIConfig } from "./rag.js";
import * as cheerio from "cheerio";
import { randomUUID } from "node:crypto";

// ─── Páginas a scrapear ───────────────────────────────────────────────────────
export const PAGES = [
  // ── Inicio ──
  { url: "https://eit.udp.cl/", escuela: "EIT", seccion: "General", titulo: "Inicio EIT UDP" },

  // ── Nuestra Escuela ──
  {
    url: "https://eit.udp.cl/nuestra-escuela/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Nuestra Escuela",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/bienvenida/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Bienvenida EIT",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/historia/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Historia EIT",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/organizacion/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Organización EIT",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/plan-estrategico/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Plan Estratégico EIT",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/infraestructura/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Infraestructura EIT",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/tutorias-academicas/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Tutorías Académicas",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/testimonios/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Testimonios EIT",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/comite-de-carrera/",
    escuela: "EIT",
    seccion: "Nuestra Escuela",
    titulo: "Comité de Carrera",
  },
  {
    url: "https://eit.udp.cl/nuestra-escuela/academicos/",
    escuela: "EIT",
    seccion: "Cuerpo Académico",
    titulo: "Académicos EIT",
  },

  // ── Carrera ICIT ──
  {
    url: "https://eit.udp.cl/carrera-udp/sobre-la-carrera/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Sobre la Carrera",
  },
  {
    url: "https://eit.udp.cl/carrera-udp/duracion/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Duración",
  },
  {
    url: "https://eit.udp.cl/carrera-udp/titulo-y-grado/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Título y Grado",
  },
  {
    url: "https://eit.udp.cl/carrera-udp/acreditacion/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Acreditación",
  },
  {
    url: "https://eit.udp.cl/carrera-udp/malla-curricular/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Malla Curricular",
  },
  {
    url: "https://eit.udp.cl/asignaturas/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Asignaturas",
  },
  {
    url: "https://eit.udp.cl/carrera-udp/perfil-de-egreso/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Perfil de Egreso",
  },
  {
    url: "https://eit.udp.cl/carrera-udp/campo-laboral/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Campo Laboral",
  },
  {
    url: "https://eit.udp.cl/carrera-udp/preguntas-frecuentes/",
    escuela: "EIT",
    seccion: "Carrera ICIT",
    titulo: "ICIT - Preguntas Frecuentes",
  },

  // ── Carrera CDAI ──
  {
    url: "https://eit.udp.cl/carrera-udp/sobre-la-carrera-2/",
    escuela: "EIT",
    seccion: "Carrera CDAI",
    titulo: "CDAI - Sobre la Carrera",
  },
  {
    url: "https://eit.udp.cl/malla-curricular-2/",
    escuela: "EIT",
    seccion: "Carrera CDAI",
    titulo: "CDAI - Malla Curricular",
  },
  {
    url: "https://eit.udp.cl/asignaturas-2/",
    escuela: "EIT",
    seccion: "Carrera CDAI",
    titulo: "CDAI - Asignaturas",
  },
  {
    url: "https://eit.udp.cl/carrera-udp/perfil-de-egreso-2/",
    escuela: "EIT",
    seccion: "Carrera CDAI",
    titulo: "CDAI - Perfil de Egreso",
  },
  {
    url: "https://eit.udp.cl/campo-laboral/",
    escuela: "EIT",
    seccion: "Carrera CDAI",
    titulo: "CDAI - Campo Laboral",
  },

  // ── Asuntos Estudiantiles ──
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/",
    escuela: "EIT",
    seccion: "Asuntos Estudiantiles",
    titulo: "Asuntos Estudiantiles",
  },
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/practicas/",
    escuela: "EIT",
    seccion: "Prácticas",
    titulo: "Prácticas EIT",
  },
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/titulacion/",
    escuela: "EIT",
    seccion: "Titulación",
    titulo: "Titulación EIT",
  },
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/reglamentos/",
    escuela: "EIT",
    seccion: "Reglamentos",
    titulo: "Reglamentos EIT",
  },
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/titulados/",
    escuela: "EIT",
    seccion: "Titulados",
    titulo: "Titulados EIT",
  },
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/udpiler/",
    escuela: "EIT",
    seccion: "UDPiler",
    titulo: "UDPiler",
  },
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/herramientas-y-manuales/",
    escuela: "EIT",
    seccion: "Herramientas",
    titulo: "Herramientas y Manuales",
  },
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/sitios-internos/",
    escuela: "EIT",
    seccion: "Asuntos Estudiantiles",
    titulo: "Sitios Internos EIT",
  },
  {
    url: "https://eit.udp.cl/asuntos-estudiantiles/ayudantias/",
    escuela: "EIT",
    seccion: "Ayudantías",
    titulo: "Postulación y Requisitos de Ayudantías EIT",
  },

  // ── Investigación ──
  {
    url: "https://eit.udp.cl/investigacion/areas-de-investigacion/",
    escuela: "EIT",
    seccion: "Investigación",
    titulo: "Áreas de Investigación",
  },
  {
    url: "https://eit.udp.cl/investigacion/conferencias/",
    escuela: "EIT",
    seccion: "Investigación",
    titulo: "Conferencias EIT",
  },
  {
    url: "https://eit.udp.cl/investigacion/proyectos-en-docencia-formativa/",
    escuela: "EIT",
    seccion: "Investigación",
    titulo: "Proyectos en Docencia Formativa",
  },

  // ── Vinculación con el Medio ──
  {
    url: "https://eit.udp.cl/vinculacion-con-el-medio/",
    escuela: "EIT",
    seccion: "Vinculación",
    titulo: "Vinculación con el Medio",
  },
  {
    url: "https://eit.udp.cl/vinculacion-con-el-medio/actividades/",
    escuela: "EIT",
    seccion: "Vinculación",
    titulo: "Actividades EIT",
  },
  {
    url: "https://eit.udp.cl/vinculacion-con-el-medio/concursos/",
    escuela: "EIT",
    seccion: "Vinculación",
    titulo: "Concursos EIT",
  },
  {
    url: "https://eit.udp.cl/vinculacion-con-el-medio/seminarios/",
    escuela: "EIT",
    seccion: "Vinculación",
    titulo: "Seminarios EIT",
  },
  {
    url: "https://eit.udp.cl/vinculacion-con-el-medio/organizaciones/",
    escuela: "EIT",
    seccion: "Vinculación",
    titulo: "Organizaciones Estudiantiles",
  },
  {
    url: "https://eit.udp.cl/vinculacion-con-el-medio/internacionalizacion/",
    escuela: "EIT",
    seccion: "Vinculación",
    titulo: "Internacionalización EIT",
  },
  {
    url: "https://eit.udp.cl/vinculacion-con-el-medio/rama-ieee-udp/",
    escuela: "EIT",
    seccion: "Vinculación",
    titulo: "Rama IEEE UDP",
  },

  // ── Noticias ──
  {
    url: "https://eit.udp.cl/nuestras-noticias/",
    escuela: "EIT",
    seccion: "Noticias",
    titulo: "Noticias EIT",
  },

  // ── Bienestar Estudiantil (DAE UDP) ──
  {
    url: "https://dae.udp.cl/bienestar-estudiantil/",
    escuela: "EIT",
    seccion: "Bienestar",
    titulo: "Bienestar Estudiantil DAE",
  },
  {
    url: "https://dae.udp.cl/bienestar-estudiantil/tarjeta-nacional-estudiantil-tne/",
    escuela: "EIT",
    seccion: "Bienestar",
    titulo: "Tarjeta Nacional Estudiantil TNE DAE",
  },
  {
    url: "https://dae.udp.cl/bienestar-estudiantil/orientacion-y-beneficios-estudiantiles/",
    escuela: "EIT",
    seccion: "Bienestar",
    titulo: "Orientación y Beneficios Estudiantiles",
  },
  {
    url: "https://dae.udp.cl/bienestar-estudiantil/atencion-y-orientacion-social/",
    escuela: "EIT",
    seccion: "Bienestar",
    titulo: "Atención y Orientación Social",
  },
  {
    url: "https://dae.udp.cl/salud-mental-estudiantil/",
    escuela: "EIT",
    seccion: "Bienestar",
    titulo: "Salud Mental Estudiantil",
  },
  {
    url: "https://dae.udp.cl/salud-mental-estudiantil/atencion-individual/",
    escuela: "EIT",
    seccion: "Bienestar",
    titulo: "Atención Psicológica Individual",
  },
  {
    url: "https://dae.udp.cl/programas-dae/",
    escuela: "EIT",
    seccion: "Bienestar",
    titulo: "Programas DAE UDP",
  },

  // ── Calendario Académico ──
  {
    url: "https://www.udp.cl/calendario-academico/",
    escuela: "EIT",
    seccion: "Calendario Académico",
    titulo: "Calendario Académico UDP",
  },

  // ── Trámites transversales de la universidad ──
  // La toma de ramos no vive en el sitio de la EIT sino en el de estudiantes, y
  // por eso el asistente no tenía forma de responderla: inventó portal.udp.cl,
  // después el SGA (que ya no existe) y después Canvas. La URL es estable y su
  // contenido se actualiza cada fin de semestre, así que el re-scrape periódico
  // la mantiene al día sin intervención.
  {
    url: "https://estudiantes.udp.cl/servicios-academicos/toma-de-ramos/",
    escuela: "EIT",
    seccion: "Toma de Ramos",
    titulo: "Toma de Ramos UDP",
  },

  // ── Admisión ──
  // Fichas oficiales de ambas carreras: título profesional, grado, duración,
  // código DEMRE y ponderaciones NEM/PAES. Sin esto el asistente inventaba
  // requisitos de ingreso ("edad mínima", "bachillerato"), que no existen.
  // Ojo: las ponderaciones cambian por año de admisión, así que estas páginas
  // dependen del re-scrape periódico para no quedar desactualizadas.
  {
    url: "https://admision.udp.cl/carrera/ingenieria-civil-en-informatica-y-telecomunicaciones/",
    escuela: "EIT",
    seccion: "Admisión ICIT",
    titulo: "Admisión ICIT - Ingeniería Civil en Informática y Telecomunicaciones",
  },
  {
    url: "https://admision.udp.cl/carrera/ingenieria-civil-en-ciencia-de-datos-e-inteligencia-artificial/",
    escuela: "EIT",
    seccion: "Admisión CDAI",
    titulo: "Admisión CDAI - Ingeniería Civil en Ciencia de Datos e Inteligencia Artificial",
  },
];

// ─── Limpieza de HTML con extracción estructurada ────────────────────────────
/**
 * Extrae el contenido principal de una página conservando la jerarquía de
 * encabezados (h1-h4 se marcan como "# ", "## ", etc., estilo Markdown) y
 * recopila los enlaces relevantes (especialmente PDFs y documentos) para
 * anexarlos al final del texto como una sección de referencias.
 *
 * Esto permite que el chunking posterior (chunkText) respete la estructura
 * semántica del documento en vez de operar sobre un blob de texto plano.
 */
function decodeCloudflareEmail(encoded) {
  try {
    let email = "";
    const r = parseInt(encoded.substr(0, 2), 16);
    for (let n = 2; n < encoded.length; n += 2) {
      const c = parseInt(encoded.substr(n, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch {
    return "";
  }
}

export function stripHtml(html, pageUrl = "") {
  const $ = cheerio.load(html);

  // Eliminar selectores ruidosos
  $("script, style, nav, header, footer, iframe, noscript, svg, form, aside").remove();
  $(".menu, .navigation, .sidebar, .widget, .footer, .header, #sidebar, #header, #footer").remove();

  // Sitios armados con constructores visuales (Elementor y similares) no usan
  // <nav> ni <header>: admision.udp.cl no tiene ninguna de las dos etiquetas, así
  // que el menú completo sobrevivía y terminaba indexado como si fuera contenido.
  // Se eliminan por subcadena de clase, que es como esos constructores nombran sus
  // contenedores de navegación.
  $('[class*="menu"], [class*="nav-"], [class*="-nav"], [role="navigation"]').remove();

  // Eliminar contenido invisible para el usuario.
  //
  // Esto no es cosmético: el scraper ingiere dae.udp.cl y udp.cl, que la escuela
  // no controla. Texto escondido con display:none o en blanco-sobre-blanco es un
  // vector de prompt injection — entraría al contexto RAG como si fuera contenido
  // legítimo de la página, sin que ningún humano lo vea al revisar el sitio.
  $("[hidden], [aria-hidden='true']").remove();
  $("[style*='display:none'], [style*='display: none']").remove();
  $("[style*='visibility:hidden'], [style*='visibility: hidden']").remove();
  $("[style*='font-size:0'], [style*='font-size: 0']").remove();
  $("*")
    .contents()
    .filter((_, node) => node.type === "comment")
    .remove();

  // Buscar contenedor de contenido principal
  const contentSelectors = [
    "article",
    ".entry-content",
    ".post-content",
    "main",
    "#main",
    "#content",
    ".content",
    ".page-content",
  ];

  let $root = null;
  for (const selector of contentSelectors) {
    const el = $(selector).first();
    if (el.length > 0) {
      $root = el;
      break;
    }
  }
  if (!$root) {
    $root = $("body");
  }

  // Desofuscar correos protegidos por Cloudflare (data-cfemail)
  $root.find("[data-cfemail], .__cf_email__").each((_, el) => {
    const encoded = $(el).attr("data-cfemail");
    if (encoded) {
      const decoded = decodeCloudflareEmail(encoded);
      if (decoded) $(el).text(decoded);
    }
  });

  // Recolectar enlaces a documentos descargables (PDF, DOC, XLS, etc.) dentro del contenido principal.
  const documentLinks = [];
  const seenLinks = new Set();
  $root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const isDoc = /\.(pdf|docx?|xlsx?|pptx?)(\?.*)?$/i.test(href);
    if (!isDoc) return;
    let absoluteUrl = href;
    try {
      absoluteUrl = pageUrl ? new URL(href, pageUrl).toString() : href;
    } catch {
      /* href malformado, se usa tal cual */
    }
    if (seenLinks.has(absoluteUrl)) return;
    seenLinks.add(absoluteUrl);
    const label = $(el).text().trim().replace(/\s+/g, " ") || absoluteUrl;
    documentLinks.push({ label, url: absoluteUrl });
  });

  // Recorrer el árbol preservando la jerarquía de encabezados y párrafos.
  const HEADING_PREFIX = { h1: "# ", h2: "## ", h3: "### ", h4: "#### " };
  const blockSelector = "h1, h2, h3, h4, p, li, td, th, blockquote, figcaption";
  const lines = [];

  const vistos = new Set();
  const agregar = (texto, prefijo = "") => {
    if (!texto || vistos.has(texto)) return;
    vistos.add(texto);
    lines.push(`${prefijo}${texto}`);
  };

  $root.find(blockSelector).each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    agregar(text, HEADING_PREFIX[tag] ?? "");
  });

  // Segunda pasada para sitios armados con constructores visuales.
  //
  // Elementor y similares no usan <p> ni <li>: ponen el texto en <div> y <span>.
  // En admision.udp.cl eso hacía desaparecer justo los datos más valiosos —el
  // título profesional, la duración, el código DEMRE y las ponderaciones NEM/PAES—
  // porque ninguna de esas etiquetas estaba en blockSelector.
  //
  // Solo se toman los nodos HOJA (sin hijos que a su vez contengan texto): recorrer
  // todos los div anidados duplicaría cada párrafo tantas veces como contenedores
  // lo envuelvan. El Set de vistos cubre lo que igual se solape.
  $root.find("div, span, dt, dd").each((_, el) => {
    const $el = $(el);
    if ($el.children().length > 0) return; // no es hoja
    agregar($el.text().replace(/\s+/g, " ").trim());
  });

  // Si no se encontraron bloques estructurados (página con markup inusual),
  // caemos de vuelta al texto plano del contenedor principal.
  let body = lines.join("\n\n").trim();
  if (!body) {
    body = $root
      .text()
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();
  }

  body = body
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");

  if (documentLinks.length) {
    const refs = documentLinks.map((d) => `- ${d.label}: ${d.url}`).join("\n");
    body += `\n\n## Documentos y enlaces relacionados\n${refs}`;
  }

  return body.trim();
}

// ─── Chunking semántico (respeta encabezados y párrafos) ────────────────────
const HEADING_LINE_RE = /^(#{1,4})\s+/;

/**
 * Divide el texto en chunks respetando la estructura semántica:
 * - Los encabezados (líneas "# ", "## ", etc. producidas por stripHtml)
 *   se tratan como puntos de corte naturales: si el chunk actual ya tiene
 *   contenido y llega un nuevo encabezado, se cierra el chunk en curso
 *   en vez de seguir acumulando bajo un título distinto.
 * - Los párrafos nunca se cortan a mitad de camino, salvo que un párrafo
 *   por sí solo exceda el tamaño máximo (en cuyo caso se subdivide por
 *   oraciones para no perder ese contenido).
 * - Se mantiene un solapamiento en palabras entre chunks consecutivos para
 *   preservar contexto en los bordes.
 */
export function chunkText(text, size = 150, overlap = 30) {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;
  let currentHeading = null;

  function flushChunk() {
    if (currentChunk.length === 0) return;
    const joined = currentChunk.join("\n\n").trim();
    if (joined.length > 80) chunks.push(joined);

    // Solapamiento: conservar las últimas palabras del CONTENIDO (sin el heading,
    // que se re-antepone aparte) para no duplicar el título en el chunk siguiente.
    const contentOnly = currentChunk.filter((p) => p !== currentHeading).join(" ");
    const overlapWords = contentOnly.split(/\s+/).filter(Boolean).slice(-overlap);
    currentChunk = [];
    currentWordCount = 0;
    if (currentHeading) {
      currentChunk.push(currentHeading);
      currentWordCount += currentHeading.split(/\s+/).length;
    }
    if (overlapWords.length) {
      currentChunk.push(overlapWords.join(" "));
      currentWordCount += overlapWords.length;
    }
  }

  /** Subdivide un párrafo demasiado largo por oraciones, sin exceder `size` palabras por trozo. */
  function splitLongParagraph(paragraph) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    const parts = [];
    let buf = [];
    let bufWords = 0;
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).length;
      if (bufWords + words > size && buf.length > 0) {
        parts.push(buf.join(" "));
        buf = [];
        bufWords = 0;
      }
      buf.push(sentence);
      bufWords += words;
    }
    if (buf.length) parts.push(buf.join(" "));
    return parts;
  }

  for (const para of paragraphs) {
    const isHeading = HEADING_LINE_RE.test(para);
    const words = para.split(/\s+/);

    if (isHeading) {
      // Un nuevo encabezado cierra el chunk anterior si ya tiene contenido de sobra,
      // para no mezclar dos secciones distintas en un mismo fragmento.
      if (currentChunk.length > 0 && currentWordCount >= size * 0.4) {
        flushChunk();
      }
      currentHeading = para;
      currentChunk.push(para);
      currentWordCount += words.length;
      continue;
    }

    // Párrafo individual más grande que el tamaño máximo: subdividir por oraciones
    // en vez de cortarlo a mitad de palabra.
    if (words.length > size) {
      for (const part of splitLongParagraph(para)) {
        const partWords = part.split(/\s+/).length;
        if (currentWordCount + partWords > size && currentChunk.length > 0) {
          flushChunk();
        }
        currentChunk.push(part);
        currentWordCount += partWords;
      }
      continue;
    }

    // Si añadir este párrafo completo excede el tamaño máximo, cerramos el chunk
    // actual SIN partir el párrafo (se mueve entero al siguiente chunk).
    if (currentWordCount + words.length > size && currentChunk.length > 0) {
      flushChunk();
    }

    currentChunk.push(para);
    currentWordCount += words.length;
  }

  if (currentChunk.length > 0) {
    const finalStr = currentChunk.join("\n\n").trim();
    if (finalStr.length > 80) {
      chunks.push(finalStr);
    }
  }

  // Red de seguridad, independiente del sitio: los selectores de arriba dependen de
  // cómo esté marcado cada página, y siempre habrá uno que no encaje. Un chunk de
  // navegación es una lista de etiquetas cortas sin oraciones, y si entra al índice
  // compite en la búsqueda con contenido real y gana por casualidad léxica.
  return chunks.filter((c) => !looksLikeNavigation(c));
}

/**
 * ¿Este bloque es un menú y no contenido?
 *
 * Se apoya en la forma, no en palabras concretas: la navegación son muchas líneas
 * muy cortas y casi sin puntuación de oración, mientras que un párrafo real tiene
 * líneas largas y termina frases.
 */
export function looksLikeNavigation(text) {
  const lineas = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length < 5) return false;

  const largoPromedio = lineas.reduce((n, l) => n + l.length, 0) / lineas.length;
  const finalesDeOracion = (text.match(/[.!?](\s|$)/g) || []).length;

  // Muchas líneas cortas y casi ninguna oración terminada.
  return largoPromedio < 40 && finalesDeOracion < lineas.length / 4;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * Elimina todas las filas de una URL que NO pertenezcan al batch indicado.
 * Se usa para limpiar versiones anteriores una vez que el nuevo batch
 * quedó insertado y verificado por completo (nunca antes).
 */
async function deleteOldBatches(url, keepBatchId) {
  const query = `url=eq.${encodeURIComponent(url)}&batch_id=neq.${encodeURIComponent(keepBatchId)}`;
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/eit_docs?${query}`, {
    method: "DELETE",
    headers: supabaseHeaders(),
  });
  if (!res.ok) {
    throw new Error(`No se pudieron limpiar versiones antiguas: ${await res.text()}`);
  }
}

/** Elimina un batch específico (usado para rollback si la ingesta falla a mitad de camino). */
async function deleteBatch(url, batchId) {
  const query = `url=eq.${encodeURIComponent(url)}&batch_id=eq.${encodeURIComponent(batchId)}`;
  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/eit_docs?${query}`, {
      method: "DELETE",
      headers: supabaseHeaders(),
    });
  } catch (e) {
    console.error(`[SCRAPE] Rollback de batch ${batchId} falló:`, e.message);
  }
}

/** Cuenta cuántas filas existen para un batch dado (verificación de integridad post-inserción). */
async function countBatchRows(url, batchId) {
  const query = `url=eq.${encodeURIComponent(url)}&batch_id=eq.${encodeURIComponent(batchId)}&select=id`;
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/eit_docs?${query}`, {
    method: "GET",
    headers: { ...supabaseHeaders(), Prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`No se pudo verificar el batch: ${await res.text()}`);
  const contentRange = res.headers.get("content-range"); // formato "0-4/5"
  const total = contentRange ? Number(contentRange.split("/")[1]) : (await res.json()).length;
  return Number.isFinite(total) ? total : 0;
}

async function insertChunk(row) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/eit_docs`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Insert fallido: ${await res.text()}`);
  }
}

// ─── Scraping de una página con concurrencia controlada ────────────────────────
/**
 * Ingesta versionada/atómica: los chunks nuevos se insertan bajo un `batch_id`
 * único (UUID). Solo si TODOS los chunks se insertan y la verificación de
 * integridad confirma el conteo esperado, se eliminan las versiones anteriores
 * de esa URL. Si algo falla a mitad de camino, se hace rollback del batch nuevo
 * y la versión anterior permanece intacta (nunca hay una ventana sin datos).
 *
 * Requiere la columna `batch_id` (uuid, indexada junto a `url`) en `eit_docs`.
 * Ver migración SQL sugerida en scripts/migrations/001_batch_id.sql.
 */
export async function scrapePage({ url, escuela, seccion, titulo }, { log = console.log } = {}) {
  log(`📄 ${url}`);

  const res = await fetch(url, {
    headers: { "User-Agent": "EIT-Asistente-Bot/1.0 (scraper academico)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = stripHtml(await res.text(), url);
  if (text.length < 100) throw new Error("Contenido muy corto");

  const chunks = chunkText(text);
  const batchId = randomUUID();
  // Identidad de embeddings ACTIVA. Antes se leía siempre `ollamaEmbedModel` y se
  // escribía siempre en `embedding_1024`, así que con AI_PROVIDER="gemini" el
  // scraper generaba vectores de 768 dims, los mandaba a una columna vector(1024)
  // —lo que Postgres rechaza— y además los etiquetaba como "bge-m3".
  const { embedModel, embedColumn } = getAIConfig();

  // Vectorización por lotes contra /api/embed. Antes era un request por chunk con
  // 200ms de espera entre medio (necesario para no gatillar rate limits de la API
  // externa); contra Ollama local esa restricción no existe.
  const EMBED_BATCH_SIZE = 32;

  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const slice = chunks.slice(i, i + EMBED_BATCH_SIZE);
      // embedTexts valida la dimensión de cada vector y lanza si no calza con
      // EMBED_DIM, así que un modelo equivocado aborta la ingesta en vez de
      // contaminar la tabla con vectores de otro espacio.
      const embeddings = await embedTexts(slice);

      for (let j = 0; j < slice.length; j++) {
        const idx = i + j;
        await insertChunk({
          url,
          escuela,
          seccion,
          titulo: chunks.length > 1 ? `${titulo} (parte ${idx + 1})` : titulo,
          contenido: slice[j],
          // La columna depende del espacio vectorial del proveedor activo.
          [embedColumn]: JSON.stringify(embeddings[j]),
          embedding_model: embedModel,
          batch_id: batchId,
        });
      }
    }

    // Verificación de integridad: el número de filas insertadas en el batch
    // nuevo debe coincidir con el número de chunks generados.
    const insertedCount = await countBatchRows(url, batchId);
    if (insertedCount !== chunks.length) {
      throw new Error(
        `Verificación de integridad falló: se insertaron ${insertedCount} de ${chunks.length} chunks`,
      );
    }

    // Solo ahora que el batch nuevo está completo y verificado, se eliminan
    // las versiones anteriores de esta URL.
    await deleteOldBatches(url, batchId);
  } catch (e) {
    log(`  ⚠️ Ingesta fallida, revirtiendo batch nuevo: ${e.message}`);
    await deleteBatch(url, batchId);
    throw e;
  }

  log(`  → ${chunks.length} chunks ✓`);
  return chunks.length;
}
