import { useState } from "react";
import { ChevronDown, Download, ArrowUpRight, HelpCircle, X, Star, Check } from "lucide-react";
import { HELP_CATEGORIES, type DocItem } from "./categories";

interface ChatSidebarProps {
  onSendMessage: (text: string) => void;
  hideMobileTrigger?: boolean;
}

export function ChatSidebar({ onSendMessage, hideMobileTrigger = false }: ChatSidebarProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedSubsection, setExpandedSubsection] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // General feedback form states
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setErrorMsg("Por favor selecciona una valoración (estrellas).");
      return;
    }
    setErrorMsg("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/general-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });

      if (!res.ok) throw new Error("Error en el servidor");
      setSubmitted(true);
    } catch {
      setErrorMsg("Ocurrió un error al enviar tu valoración. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const feedbackForm = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-udp-line dark:bg-udp-surface">
      <h2 className="mb-2 text-sm font-semibold tracking-tight text-udp-ink">
        ¿Cómo podemos mejorar?
      </h2>

      {submitted ? (
        <div className="flex flex-col items-center justify-center py-4 text-center animate-in zoom-in-95 duration-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
            <Check className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-udp-ink mb-1">¡Gracias por calificar!</p>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Tus comentarios nos ayudan a mejorar el asistente día a día.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setRating(0);
              setComment("");
            }}
            className="mt-3.5 text-[10px] font-semibold text-udp-red hover:underline cursor-pointer"
          >
            Enviar otra valoración
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmitFeedback} className="flex flex-col gap-3">
          <p className="text-[11px] text-muted-foreground leading-normal">
            Califica el servicio y déjanos tus sugerencias para seguir mejorando.
          </p>

          {/* Star Rating Grid */}
          <div className="flex items-center justify-center gap-1.5 py-1">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= (hoverRating || rating);
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-0.5 transition-transform hover:scale-110 active:scale-95 cursor-pointer outline-none"
                  title={`${star} Estrella${star > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`h-6 w-6 transition-colors ${
                      active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/35"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Comment input */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Escribe tus comentarios o críticas..."
            rows={3}
            className="w-full rounded-xl border border-udp-line bg-udp-soft/40 px-3 py-2 text-xs text-udp-ink placeholder:text-muted-foreground outline-none focus:border-udp-red/40 focus:bg-udp-surface transition-colors"
          />

          {errorMsg && <p className="text-[10px] text-red-500 leading-tight">{errorMsg}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-udp-red py-2 text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 cursor-pointer shadow-[var(--shadow-soft)]"
          >
            <span>{submitting ? "Enviando..." : "Enviar valoración"}</span>
          </button>
        </form>
      )}
    </div>
  );

  const sidebarContent = (
    <>
      {/* Secciones de ayuda por categorías */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-udp-line dark:bg-udp-surface">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-udp-ink">Temas de ayuda</h2>
        <div className="flex flex-col gap-1">
          {HELP_CATEGORIES.map(({ label, icon: Icon, subsections }) => {
            const isOpen = expandedCategory === label;
            return (
              <div
                key={label}
                className="border-b border-udp-line/40 last:border-b-0 py-1 first:pt-0 last:pb-0"
              >
                <button
                  onClick={() => {
                    const nextOpen = isOpen ? null : label;
                    setExpandedCategory(nextOpen);
                    setExpandedSubsection(null);
                  }}
                  className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm text-udp-ink transition-all duration-300 ease-out hover:bg-udp-soft active:scale-[0.98] cursor-pointer"
                >
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors duration-300 ${isOpen ? "bg-udp-red/10 text-udp-red" : "bg-udp-soft text-slate-500 group-hover:bg-udp-red/10 group-hover:text-udp-red"}`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span
                    className={`flex-1 font-semibold tracking-tight leading-tight transition-transform duration-300 ease-out group-hover:translate-x-0.5 ${isOpen ? "text-udp-ink" : ""}`}
                  >
                    {label}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 transition-transform duration-300 ease-out group-hover:text-udp-red ${isOpen ? "rotate-180 text-udp-red" : "text-muted-foreground"}`}
                  />
                </button>
                <div
                  className="grid transition-all duration-300 ease-in-out overflow-hidden"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="min-h-0">
                    <div className="ml-[2.75rem] flex flex-col gap-3.5 pb-3 pt-1.5 pr-1">
                      {subsections.map((sub, subIdx) => {
                        const subKey = `${label}-${sub.title}`;
                        const isSubOpen = expandedSubsection === subKey;
                        return (
                          <div key={subIdx} className="flex flex-col gap-1">
                            <button
                              onClick={() => setExpandedSubsection(isSubOpen ? null : subKey)}
                              className="group flex w-full items-center justify-between rounded-lg py-1 px-1.5 text-left transition-all duration-300 ease-out hover:bg-udp-soft hover:translate-x-0.5 cursor-pointer"
                            >
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/90 group-hover:text-udp-ink transition-colors">
                                {sub.title}
                              </span>
                              <ChevronDown
                                className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70 transition-transform duration-300 ease-out group-hover:text-udp-ink ${isSubOpen ? "rotate-180" : ""}`}
                              />
                            </button>
                            <div
                              className="grid transition-all duration-300 ease-in-out overflow-hidden"
                              style={{ gridTemplateRows: isSubOpen ? "1fr" : "0fr" }}
                            >
                              <div className="min-h-0">
                                <div className="flex flex-col gap-1 pb-1 pt-0.5 pl-1.5">
                                  {sub.type === "docs"
                                    ? (sub.items as DocItem[]).map((doc) => (
                                        <a
                                          key={doc.url}
                                          href={doc.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="group flex items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 transition-all duration-300 ease-out hover:translate-x-0.5 hover:bg-udp-red/5 hover:text-udp-ink dark:text-muted-foreground"
                                        >
                                          <Download className="h-3.5 w-3.5 flex-shrink-0 text-udp-red/60 mt-0.5" />
                                          <span className="flex-1 leading-normal">{doc.name}</span>
                                          <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-udp-red mt-0.5" />
                                        </a>
                                      ))
                                    : (sub.items as string[]).map((q) => (
                                        <button
                                          key={q}
                                          onClick={() => {
                                            onSendMessage(q);
                                            setMobileOpen(false);
                                          }}
                                          className="group flex items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 transition-all duration-300 ease-out hover:translate-x-0.5 hover:bg-udp-red/5 hover:text-udp-ink active:scale-[0.98] cursor-pointer w-full dark:text-muted-foreground"
                                        >
                                          <span className="flex-1 leading-normal">{q}</span>
                                          <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-udp-red mt-0.5" />
                                        </button>
                                      ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Buzón de sugerencias e interactividad general */}
      {feedbackForm}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="udp-scroll hidden lg:flex flex-col gap-5 lg:overflow-y-auto lg:pr-1">
        {sidebarContent}
      </aside>

      {/* Mobile FAB */}
      {!hideMobileTrigger && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-24 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-udp-red text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.25)] transition-all hover:scale-105 active:scale-95 cursor-pointer lg:hidden no-print"
          aria-label="Abrir temas de ayuda"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      )}

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-[85vw] max-w-sm bg-udp-canvas shadow-[-8px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-udp-line px-5 py-4">
          <h2 className="font-serif text-base font-semibold tracking-tight text-udp-ink">
            Temas de ayuda
          </h2>
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-udp-line bg-udp-soft text-muted-foreground hover:text-udp-ink cursor-pointer"
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="udp-scroll flex flex-col gap-5 overflow-y-auto p-5 h-[calc(100%-4rem)]">
          {sidebarContent}
        </div>
      </div>
    </>
  );
}
