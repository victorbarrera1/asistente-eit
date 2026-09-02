import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, Check, Copy, GraduationCap } from "lucide-react";
import { parseMarkdown, splitSources, SourceCards } from "./markdown";

export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
  feedback?: "positive" | "negative";
  feedbackComment?: string;
  showCommentInput?: boolean;
  suggestions?: string[];
  timestamp?: number;
}

interface ChatMessageProps {
  message: ChatMessageData;
  index: number;
  busy: boolean;
  onThumbsUp: (index: number) => void;
  onThumbsDown: (index: number) => void;
  onSubmitNegativeFeedback: (index: number, comment: string) => void;
  onCancelComment: (index: number) => void;
  onSuggestionClick?: (text: string) => void;
}

function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Copia texto al portapapeles de forma universal y robusta.
 * Funciona en contextos seguros (HTTPS, localhost) y en entornos no seguros (HTTP por IP, iframes).
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Intento con Clipboard API nativa (navegadores modernos con HTTPS o localhost)
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Si falla por contexto no seguro, permisos o iframe restringido, usamos el fallback
    }
  }

  // 2. Fallback universal con elemento textarea temporal (funciona en HTTP de red local y Safari)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Error al copiar texto:", err);
    return false;
  }
}

function CopyButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="relative inline-flex items-center">
      {/* Pop-up flotante sobre el botón */}
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-full right-0 mb-2 z-30 flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xl dark:bg-slate-100 dark:text-slate-900 pointer-events-none transition-all duration-200 animate-in fade-in zoom-in-95"
        >
          <Check className="h-3 w-3 text-emerald-400 dark:text-emerald-600 stroke-[3]" />
          <span>¡Copiado con éxito!</span>
          {/* Flecha indicadora */}
          <span className="absolute -bottom-1 right-2.5 h-2 w-2 rotate-45 bg-slate-900 dark:bg-slate-100" />
        </div>
      )}

      <button
        type="button"
        onClick={onCopy}
        className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-300 ease-out hover:scale-105 active:scale-90 cursor-pointer ${
          copied
            ? "border-emerald-300 bg-emerald-50 text-emerald-600"
            : "border-udp-line bg-udp-surface text-muted-foreground hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600"
        }`}
        title={copied ? "¡Copiado con éxito!" : "Copiar respuesta"}
        aria-label="Copiar respuesta"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function ChatMessage({
  message: m,
  index: i,
  busy,
  onThumbsUp,
  onThumbsDown,
  onSubmitNegativeFeedback,
  onCancelComment,
  onSuggestionClick,
}: ChatMessageProps) {
  const { body, sources } =
    m.role === "assistant" ? splitSources(m.content) : { body: m.content, sources: [] };

  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(m.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const timeStr = formatTime(m.timestamp);

  return (
    <div
      className={`udp-rise flex max-w-[92%] flex-col gap-1.5 sm:max-w-[82%] ${
        m.role === "user" ? "items-end self-end" : "items-start self-start"
      }`}
    >
      {/* Toast flotante en pantalla */}
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-slate-900/95 dark:bg-slate-100/95 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 shadow-2xl backdrop-blur-md pointer-events-none border border-white/10 dark:border-black/10 transition-all duration-300 animate-in fade-in slide-in-from-bottom-3"
        >
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white dark:bg-emerald-600">
            <Check className="h-2.5 w-2.5 stroke-[3]" />
          </div>
          <span>¡Copiado con éxito!</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
          {m.role === "user" ? "Tú" : "Asistente UDP"}
        </span>
        {timeStr && <span className="text-[10px] text-muted-foreground/60">{timeStr}</span>}
      </div>

      <div className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
        {/* Bot avatar */}
        {m.role === "assistant" && (
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-udp-red/10 text-red-700 mt-0.5">
            <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
        )}

        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div
            className={`px-4 py-3 text-[14.5px] leading-relaxed ${
              m.role === "user"
                ? "rounded-2xl rounded-br-md bg-udp-red text-white shadow-[var(--shadow-soft)]"
                : "rounded-2xl rounded-bl-md border border-udp-line bg-udp-soft/60 text-udp-ink"
            }`}
          >
            {m.role === "assistant" ? parseMarkdown(body) : m.content}

            {m.role === "assistant" && (
              <>
                {/* Fuentes oficiales como tarjetas clicables */}
                <SourceCards sources={sources} />
              </>
            )}

            {/* Feedback Loop + Copy (Thumbs Up/Down) */}
            {m.role === "assistant" && i > 0 && !busy && (
              <div className="no-print">
                {!m.feedback ? (
                  <div className="mt-3.5 flex flex-col gap-2 border-t border-udp-line/50 pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        ¿Fue útil esta respuesta?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <CopyButton copied={copied} onCopy={() => void handleCopy()} />
                        <button
                          type="button"
                          onClick={() => onThumbsUp(i)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-udp-line bg-udp-surface text-muted-foreground hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 transition-all duration-300 ease-out hover:scale-105 active:scale-90 cursor-pointer"
                          title="Sí, fue útil"
                          aria-label="Sí, fue útil"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onThumbsDown(i)}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-300 ease-out hover:scale-105 active:scale-90 cursor-pointer ${
                            m.showCommentInput
                              ? "border-udp-red/30 bg-udp-red/5 text-udp-red"
                              : "border-udp-line bg-udp-surface text-muted-foreground hover:border-udp-red/20 hover:bg-udp-red/5 hover:text-udp-red"
                          }`}
                          title="No, tiene errores o falta información"
                          aria-label="No, tiene errores o falta información"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {m.showCommentInput && (
                      <div className="mt-1 flex flex-col gap-1.5">
                        <textarea
                          placeholder="¿Qué faltó o qué estuvo incorrecto? (Opcional)..."
                          rows={2}
                          id={`comment-${i}`}
                          className="w-full rounded-lg border border-udp-line bg-udp-surface px-2.5 py-1.5 text-xs text-udp-ink placeholder:text-muted-foreground outline-none focus:border-udp-red/40"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onCancelComment(i)}
                            className="rounded-lg px-2.5 py-1 text-[11px] font-medium border border-udp-line bg-udp-surface text-muted-foreground hover:bg-udp-soft transition-all duration-300 ease-out active:scale-95 cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const textEl = document.getElementById(
                                `comment-${i}`,
                              ) as HTMLTextAreaElement;
                              const commentText = textEl ? textEl.value : "";
                              onSubmitNegativeFeedback(i, commentText);
                            }}
                            className="rounded-lg bg-udp-red px-2.5 py-1 text-[11px] font-medium text-white hover:bg-udp-red/90 transition-all duration-300 ease-out active:scale-95 cursor-pointer"
                          >
                            Enviar feedback
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3.5 border-t border-udp-line/50 pt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      <span>
                        {m.feedback === "positive"
                          ? "¡Gracias por calificar positivamente esta respuesta!"
                          : "Gracias por informarnos. Analizaremos esta consulta para mejorar."}
                      </span>
                    </div>
                    {/* Botón de copiar disponible también tras dar feedback */}
                    <CopyButton copied={copied} onCopy={() => void handleCopy()} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preguntas de seguimiento sugeridas */}
      {m.role === "assistant" && m.suggestions && m.suggestions.length > 0 && !busy && (
        <div className="flex flex-wrap gap-1.5 mt-1 ml-10 no-print">
          {m.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onSuggestionClick?.(suggestion)}
              className="group flex items-center gap-1.5 rounded-full border border-udp-line bg-udp-surface px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-udp-red/40 hover:bg-udp-red/5 hover:text-udp-ink active:scale-95 cursor-pointer"
            >
              <span className="text-udp-red/60 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:text-udp-red">
                →
              </span>
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
