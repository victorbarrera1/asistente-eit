/**
 * Renderizado de Markdown del asistente + tarjetas de fuentes.
 */
import React from "react";
import { ExternalLink } from "lucide-react";

/**
 * Solo se consideran "seguros" los links http/https. El contenido que llega
 * aquí viene del LLM (que a su vez puede citar texto scrapeado de páginas
 * externas), así que nunca se debe confiar en el esquema de una URL: un
 * `javascript:` en un href se ejecutaría al hacer clic.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseMarkdown(text: string): React.ReactNode[] {
  return text.split("\n").flatMap((line, lineIdx, lines) => {
    let isHeading = false;
    let headingLevel = 0;
    let lineContent = line;

    // Detect headings like "# title", "## title", "### title", etc.
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      isHeading = true;
      headingLevel = headingMatch[1].length;
      lineContent = headingMatch[2];
    }

    // Detect list items like "- item" or "* item"
    let isListItem = false;
    const listMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (listMatch) {
      isListItem = true;
      lineContent = listMatch[2];
    }

    const parts: React.ReactNode[] = [];

    // Inline elements: bold (**text**), markdown link ([anchor](url)), bare URL (https?://...)
    const regex = /\*\*(.*?)\*\*|\[(.*?)\]\((.*?)\)|(https?:\/\/[^\s\)]+)/g;
    let lastIndex = 0;
    let match;
    let keyIdx = 0;

    while ((match = regex.exec(lineContent)) !== null) {
      if (match.index > lastIndex) {
        parts.push(lineContent.slice(lastIndex, match.index));
      }

      const [_, boldText, linkText, linkUrl, bareUrl] = match;

      if (boldText !== undefined) {
        parts.push(
          <strong key={`bold-${lineIdx}-${keyIdx++}`} className="font-semibold text-udp-ink">
            {boldText}
          </strong>,
        );
      } else if (linkText !== undefined && linkUrl !== undefined) {
        if (isSafeUrl(linkUrl)) {
          parts.push(
            <a
              key={`link-${lineIdx}-${keyIdx++}`}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-udp-red hover:underline font-medium"
            >
              {linkText}
            </a>,
          );
        } else {
          // Esquema no seguro (ej. javascript:): se muestra como texto plano.
          parts.push(linkText);
        }
      } else if (bareUrl !== undefined) {
        let url = bareUrl;
        let trailing = "";
        const trailingPunctuation = /[.,;]$/;
        if (trailingPunctuation.test(url)) {
          trailing = url.slice(-1);
          url = url.slice(0, -1);
        }
        if (isSafeUrl(url)) {
          parts.push(
            <a
              key={`url-${lineIdx}-${keyIdx++}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-udp-red hover:underline font-medium"
            >
              {url}
            </a>,
          );
        } else {
          parts.push(url);
        }
        if (trailing) {
          parts.push(trailing);
        }
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < lineContent.length) {
      parts.push(lineContent.slice(lastIndex));
    }

    let renderedLine: React.ReactNode;

    if (isHeading) {
      let headingClass = "font-bold text-udp-ink mt-3.5 mb-1.5 block";
      if (headingLevel === 1) {
        headingClass = "text-[17px] font-extrabold text-udp-ink mt-4 mb-2 block";
      } else if (headingLevel === 2) {
        headingClass = "text-[15.5px] font-bold text-udp-ink mt-3.5 mb-1.5 block";
      } else if (headingLevel === 3) {
        headingClass = "text-[14.5px] font-bold text-udp-ink mt-3 mb-1 block";
      } else {
        headingClass = "text-[13px] font-bold text-udp-ink mt-2.5 mb-1 block";
      }
      renderedLine = (
        <span key={`h-${lineIdx}`} className={headingClass}>
          {parts}
        </span>
      );
    } else if (isListItem) {
      renderedLine = (
        <span key={`li-${lineIdx}`} className="flex items-start gap-1.5 ml-2.5 my-1 text-udp-ink">
          <span className="text-udp-red select-none mt-0.5">•</span>
          <span className="flex-1">{parts}</span>
        </span>
      );
    } else {
      renderedLine = (
        <span key={`text-${lineIdx}`} className="text-udp-ink">
          {parts}
        </span>
      );
    }

    // Add br only if not last line AND neither current line nor next line is heading/list
    const nextLine = lines[lineIdx + 1];
    const isNextHeadingOrList =
      nextLine &&
      (nextLine.startsWith("#") ||
        nextLine.trim().startsWith("-") ||
        nextLine.trim().startsWith("*"));
    const shouldAddBr =
      lineIdx < lines.length - 1 && !isHeading && !isListItem && !isNextHeadingOrList;

    if (shouldAddBr) {
      return [renderedLine, <br key={`br-${lineIdx}`} />];
    } else {
      return [renderedLine];
    }
  });
}

/**
 * Separa el cuerpo de la respuesta de las líneas "📌 Fuente: ..."
 * para renderizar las fuentes como tarjetas clicables.
 */
export function splitSources(content: string): { body: string; sources: string[] } {
  const lines = content.split("\n");
  const bodyLines: string[] = [];
  const sources: string[] = [];
  const urlRegex = /https?:\/\/[^\s\)\]]+/g;

  for (const line of lines) {
    if (/📌|^\s*Fuentes?\s*:/i.test(line)) {
      const urls = line.match(urlRegex);
      if (urls) {
        for (let url of urls) {
          url = url.replace(/[.,;]$/, "");
          if (!sources.includes(url)) sources.push(url);
        }
        continue; // la línea de fuente no va al cuerpo
      }
    }
    bodyLines.push(line);
  }

  // Quitar líneas vacías sobrantes al final
  while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) {
    bodyLines.pop();
  }

  return { body: bodyLines.join("\n"), sources };
}

/**
 * Extrae las preguntas de seguimiento sugeridas del contenido.
 * Busca la sección [SUGERENCIAS] al final de la respuesta.
 */
export function splitSuggestions(content: string): { body: string; suggestions: string[] } {
  if (!content) return { body: "", suggestions: [] };

  // Detecta [SUGERENCIAS], [PREGUNTAS SUGERIDAS], ### Sugerencias, **Sugerencias:**, Sugerencias:, etc.
  const regex = /(?:\[(?:SUGERENCIAS|PREGUNTAS SUGERIDAS)\]|#{1,4}\s*(?:Sugerencias|Preguntas sugeridas)|(?:\*\*|__)?(?:Sugerencias|Preguntas sugeridas)(?:\*\*|__)?\s*:?)/i;

  const match = regex.exec(content);
  if (!match) return { body: content, suggestions: [] };

  const body = content.slice(0, match.index).trim();
  const suggestionsBlock = content.slice(match.index + match[0].length).trim();
  const suggestions = suggestionsBlock
    .split("\n")
    .map((line) => line.replace(/^[-*•\d.)\]\s]+/, "").trim())
    .filter(
      (line) =>
        line.length > 5 &&
        line.length < 150 &&
        !line.startsWith("#") &&
        !line.toLowerCase().startsWith("fuente")
    );

  return { body, suggestions: suggestions.slice(0, 3) };
}

const DOMAIN_LABELS: Record<string, string> = {
  "eit.udp.cl": "EIT UDP",
  "dae.udp.cl": "DAE UDP",
  "agendaelectronica.udp.cl": "Agenda UDP",
  "www.udp.cl": "UDP",
  "udp.cl": "UDP",
};

function sourceLabel(url: string): { domain: string; path: string } {
  try {
    const u = new URL(url);
    const domain = DOMAIN_LABELS[u.hostname] ?? u.hostname;
    const path =
      decodeURIComponent(u.pathname).split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") ?? "";
    return { domain, path };
  } catch {
    return { domain: url, path: "" };
  }
}

export function SourceCards({ sources }: { sources: string[] }) {
  const safeSources = sources.filter(isSafeUrl);
  if (!safeSources.length) return null;
  return (
    <div className="mt-3 border-t border-udp-line/50 pt-2.5">
      <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
        Fuentes oficiales
      </span>
      <div className="flex flex-wrap gap-1.5">
        {safeSources.map((url) => {
          const { domain, path } = sourceLabel(url);
          return (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-udp-line bg-udp-surface px-2.5 py-1.5 text-[11px] transition-all hover:border-udp-red/30 hover:bg-udp-red/5"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0 text-udp-red/70" />
              <span className="font-semibold text-udp-ink">{domain}</span>
              {path && (
                <span className="truncate text-muted-foreground group-hover:text-udp-ink">
                  {path}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
