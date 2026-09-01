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
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  }

  const timeStr = formatTime(m.timestamp);

  return (
    <div
      className={`udp-rise flex max-w-[92%] flex-col gap-1.5 sm:max-w-[82%] ${
        m.role === "user" ? "items-end self-end" : "items-start self-start"
      }`}
    >
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
                        {/* Copy button */}
                        <button
                          onClick={() => void handleCopy()}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-udp-line bg-udp-surface text-muted-foreground hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 transition-all duration-300 ease-out hover:scale-105 active:scale-90 cursor-pointer"
                          title="Copiar respuesta"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => onThumbsUp(i)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-udp-line bg-udp-surface text-muted-foreground hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 transition-all duration-300 ease-out hover:scale-105 active:scale-90 cursor-pointer"
                          title="Sí, fue útil"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onThumbsDown(i)}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-300 ease-out hover:scale-105 active:scale-90 cursor-pointer ${
                            m.showCommentInput
                              ? "border-udp-red/30 bg-udp-red/5 text-udp-red"
                              : "border-udp-line bg-udp-surface text-muted-foreground hover:border-udp-red/20 hover:bg-udp-red/5 hover:text-udp-red"
                          }`}
                          title="No, tiene errores o falta información"
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
                            onClick={() => onCancelComment(i)}
                            className="rounded-lg px-2.5 py-1 text-[11px] font-medium border border-udp-line bg-udp-surface text-muted-foreground hover:bg-udp-soft transition-all duration-300 ease-out active:scale-95 cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
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
                  <div className="mt-3.5 border-t border-udp-line/50 pt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span>
                      {m.feedback === "positive"
                        ? "¡Gracias por calificar positivamente esta respuesta!"
                        : "Gracias por informarnos. Analizaremos esta consulta para mejorar."}
                    </span>
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
