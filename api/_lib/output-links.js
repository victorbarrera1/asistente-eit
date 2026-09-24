/**
 * Filtro de enlaces en las respuestas del modelo, antes de publicarlas.
 * Usado por: chat-handler.js.
 *
 * El frontend ya bloquea esquemas peligrosos (javascript:), pero muestra
 * cualquier https:// como enlace y como tarjeta de "Fuentes oficiales". Un
 * enlace inventado por el modelo, o copiado de una página comprometida que el
 * scraper ingirió, aparecería con la identidad visual de la UDP: phishing con
 * sello institucional. Solo se conservan enlaces a dominios UDP o que aparecen
 * textualmente en los documentos que el modelo recibió como evidencia.
 */

const URL_RE = /https?:\/\/[^\s)\]<>"']+/gi;
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
export const OMITTED_LINK = "(enlace omitido)";

function stripTrailingPunctuation(url) {
  return url.replace(/[.,;:!?]+$/, "");
}

export function isInstitutionalUrl(url) {
  try {
    const { protocol, hostname, username, password } = new URL(url);
    if (!["http:", "https:"].includes(protocol) || username || password) return false;
    return hostname === "udp.cl" || hostname.endsWith(".udp.cl");
  } catch {
    return false;
  }
}

/** URLs citables: las de los documentos recuperados y las que aparecen en su texto. */
export function collectEvidenceUrls(contextDocs) {
  const urls = new Set();
  for (const doc of contextDocs ?? []) {
    if (typeof doc?.url === "string") urls.add(stripTrailingPunctuation(doc.url));
    for (const match of String(doc?.contenido ?? "").match(URL_RE) ?? []) {
      urls.add(stripTrailingPunctuation(match));
    }
  }
  return urls;
}

/**
 * @param {string} text Respuesta completa del modelo.
 * @param {Set<string>} evidenceUrls URLs presentes en la evidencia.
 * @returns {{text: string, removed: number}}
 */
export function filterOutputLinks(text, evidenceUrls) {
  let removed = 0;
  const allowed = (url) => {
    const clean = stripTrailingPunctuation(url);
    if (isInstitutionalUrl(clean) || evidenceUrls.has(clean)) return true;
    removed++;
    return false;
  };

  // Primero los enlaces markdown: si no se permiten, queda solo su texto.
  const withoutLinks = text.replace(MARKDOWN_LINK_RE, (whole, label, url) =>
    allowed(url) ? whole : `${label} ${OMITTED_LINK}`,
  );
  // Después las URLs sueltas que queden.
  const result = withoutLinks.replace(URL_RE, (url) => {
    const clean = stripTrailingPunctuation(url);
    return allowed(clean) ? url : OMITTED_LINK + url.slice(clean.length);
  });
  return { text: result, removed };
}
