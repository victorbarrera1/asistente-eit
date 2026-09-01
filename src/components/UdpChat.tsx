import { useEffect, useRef, useState } from "react";
import { ChatHeader, ChatPanelHeader } from "./chat/ChatHeader";
import { ChatMessage, type ChatMessageData } from "./chat/ChatMessage";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatSidebar } from "./chat/ChatSidebar";
import { ThinkingIndicator, THINKING_STEPS } from "./chat/ThinkingIndicator";
import { splitSuggestions } from "./chat/markdown";
import { ArrowUpRight, Briefcase, MessageCircle } from "lucide-react";
import { LiquidMetalButton } from "@/components/ui/LiquidMetalButton";
import { PRIMARY_TOPICS, type PrimaryTopic } from "./chat/categories";

const WELCOME: ChatMessageData = {
  role: "assistant",
  content:
    "Hola, soy tu asistente de la Escuela de Informática y Telecomunicaciones (EIT) UDP. Puedo ayudarte con prácticas, titulación, reglamentos, laboratorio, ayudantías, herramientas académicas y bienestar estudiantil.\n\nCuéntame, ¿en qué te puedo ayudar hoy?",
  timestamp: Date.now(),
};

const STORAGE_KEY = "udp-chat-historial-v1";
const THEME_KEY = "udp-theme";

export function UdpChat() {
  const [messages, setMessages] = useState<ChatMessageData[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [showChips, setShowChips] = useState(true);
  const [dark, setDark] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<PrimaryTopic | null>(null);
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const comingSoonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Persistence ──────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === "dark") {
        setDark(true);
        document.documentElement.classList.add("dark");
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessageData[];
        if (Array.isArray(parsed) && parsed.length > 1) {
          setMessages(parsed);
          setShowChips(false);
        }
      }
    } catch {
      // historial corrupto: se ignora
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (messages.length > 1) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // almacenamiento lleno: se ignora
    }
  }, [messages, hydrated]);

  // ─── Thinking step rotation ───────────────────────────────────────────────────

  useEffect(() => {
    if (!typing) {
      setThinkingStep(0);
      return;
    }
    const id = setInterval(() => {
      setThinkingStep((s) => Math.min(s + 1, THINKING_STEPS.length - 1));
    }, 2000);
    return () => clearInterval(id);
  }, [typing]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, selectedTopic, topicPickerOpen]);

  // Limpieza del timer del toast al desmontar
  useEffect(() => {
    return () => {
      if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    };
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────────

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // sin almacenamiento disponible
    }
  }

  function resetChat() {
    setMessages([{ ...WELCOME, timestamp: Date.now() }]);
    setShowChips(true);
    setSelectedTopic(null);
    setTopicPickerOpen(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // sin almacenamiento disponible
    }
  }

  // Placeholder de "Ofertas Laborales": la integración con el portal de empleos
  // aún no existe, así que solo mostramos un aviso temporal sin tocar el RAG.
  function handleComingSoon() {
    setComingSoon(true);
    if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = setTimeout(() => setComingSoon(false), 3000);
  }

  function handleTopicSelect(topic: PrimaryTopic) {
    setSelectedTopic(topic);
    setTopicPickerOpen(true);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    window.scrollTo({ top: 0, behavior: "smooth" });

    setBusy(true);
    setShowChips(false);
    setTopicPickerOpen(false);

    const userMsg: ChatMessageData = { role: "user", content: trimmed, timestamp: Date.now() };
    const nextHistory: ChatMessageData[] = [...messages.slice(1), userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory.map(({ role, content }) => ({ role, content })),
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setTyping(false);
        const rawContent = data.reply ?? "";
        const { body, suggestions } = splitSuggestions(rawContent);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: body, suggestions, timestamp: Date.now() },
        ]);
      } else if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let started = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          if (!started) {
            started = true;
            setTyping(false);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: acc, timestamp: Date.now() },
            ]);
          } else {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: acc };
              return copy;
            });
          }
        }

        if (!started) {
          setTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "⚠️ No se recibió respuesta. Intenta nuevamente.",
              timestamp: Date.now(),
            },
          ]);
        } else {
          // Parse suggestions from the complete streamed response
          const { body, suggestions } = splitSuggestions(acc);
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: body, suggestions };
            return copy;
          });
        }
      } else {
        const text = await res.text();
        const cleanText = text
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        throw new Error(
          `El servidor respondió con código ${res.status}: ${cleanText.substring(0, 160)}...`,
        );
      }
    } catch (e) {
      setTyping(false);
      const errMsg =
        e instanceof Error
          ? e.message
          : "Ocurrió un error al procesar tu consulta. Intenta nuevamente.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Error: ${errMsg}`, timestamp: Date.now() },
      ]);
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  function handleSend() {
    const text = input;
    setInput("");
    void sendMessage(text);
  }

  // ─── Feedback handlers ────────────────────────────────────────────────────────

  async function submitFeedback(index: number, score: "positive" | "negative", comment?: string) {
    const msg = messages[index];
    const userMsg = messages[index - 1];
    const queryText = userMsg && userMsg.role === "user" ? userMsg.content : "Consulta sugerida";

    setMessages((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        feedback: score,
        feedbackComment: comment,
        showCommentInput: false,
      };
      return copy;
    });

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryText,
          reply: msg.content,
          score: score === "positive" ? "positivo" : "negativo",
          comment: comment || "",
        }),
      });
    } catch (e) {
      console.error("Error al enviar el feedback:", e);
    }
  }

  function handleThumbsDownClick(index: number) {
    setMessages((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        showCommentInput: !copy[index].showCommentInput,
      };
      return copy;
    });
  }

  // ─── Hero / Empty state ───────────────────────────────────────────────────────

  const isFirstVisit = showChips && messages.length <= 1;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden flex-col bg-slate-50 font-sans text-udp-ink dark:bg-udp-canvas">
      <ChatHeader
        dark={dark}
        onToggleTheme={toggleTheme}
        onResetChat={resetChat}
        showReset={messages.length > 1}
        busy={busy}
      />

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-3 lg:gap-6 lg:py-6 lg:h-[calc(100dvh-7rem)] lg:overflow-hidden">
        {/* Chat column */}
        <section className="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md lg:col-span-2 lg:min-h-0 dark:border-udp-line dark:bg-udp-surface">
          <ChatPanelHeader
            onResetChat={resetChat}
            showReset={messages.length > 1}
            busy={busy}
            topics={PRIMARY_TOPICS}
            activeTopic={selectedTopic?.label ?? null}
            onSelectTopic={handleTopicSelect}
          />

          {/* Messages */}
          <div
            ref={scrollRef}
            className="udp-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 scroll-smooth sm:px-6"
          >
            {/* Empty state hero */}
            {isFirstVisit && !topicPickerOpen && (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-udp-soft dark:text-muted-foreground">
                  <MessageCircle className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <div className="text-center max-w-md">
                  <h2 className="font-serif text-xl font-semibold tracking-tight text-udp-ink mb-1.5">
                    Elige un tema en la barra superior
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Verás preguntas frecuentes aquí. También puedes escribir tu propia consulta.
                  </p>
                </div>

                {/* Ofertas Laborales: placeholder visual, aún sin backend */}
                <div className="flex flex-col items-center gap-2">
                  <LiquidMetalButton
                    icon={Briefcase}
                    animationType="bounce"
                    size="md"
                    glow="udp"
                    onClick={handleComingSoon}
                    aria-label="Ofertas Laborales"
                    title="Ofertas Laborales (próximamente)"
                  />
                  <span className="text-xs font-semibold text-udp-ink">Ofertas Laborales</span>
                  <span
                    role="status"
                    aria-live="polite"
                    className={`text-[11px] text-muted-foreground transition-opacity duration-300 ${
                      comingSoon ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    ✨ Próximamente: Integración con Portal de Empleos UDP
                  </span>
                </div>
              </div>
            )}

            {isFirstVisit && topicPickerOpen && selectedTopic && (
              <TopicQuestionPanel
                key={selectedTopic.label}
                topic={selectedTopic}
                onQuestionClick={(question) => void sendMessage(question)}
                busy={busy}
              />
            )}

            {/* Normal messages (hidden during hero) */}
            {!isFirstVisit &&
              messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  message={m}
                  index={i}
                  busy={busy}
                  onThumbsUp={(idx) => void submitFeedback(idx, "positive")}
                  onThumbsDown={handleThumbsDownClick}
                  onSubmitNegativeFeedback={(idx, comment) =>
                    void submitFeedback(idx, "negative", comment)
                  }
                  onCancelComment={handleThumbsDownClick}
                  onSuggestionClick={(text) => void sendMessage(text)}
                />
              ))}

            {!isFirstVisit && topicPickerOpen && selectedTopic && (
              <TopicQuestionPanel
                key={selectedTopic.label}
                topic={selectedTopic}
                onQuestionClick={(question) => void sendMessage(question)}
                busy={busy}
                compact
              />
            )}

            {typing && <ThinkingIndicator thinkingStep={thinkingStep} />}
          </div>

          <ChatComposer
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            onSuggestionClick={(text) => void sendMessage(text)}
            busy={busy}
            showChips={!isFirstVisit && showChips}
          />
        </section>

        <ChatSidebar
          onSendMessage={(text) => void sendMessage(text)}
          hideMobileTrigger={topicPickerOpen}
        />
      </main>

      <footer className="py-4 text-center text-xs text-muted-foreground border-t border-udp-line bg-udp-surface/50 backdrop-blur-sm">
        <p className="italic">
          De estudiantes para estudiantes ·{" "}
          <a
            href="https://eit.udp.cl"
            target="_blank"
            rel="noopener noreferrer"
            className="text-udp-red/70 hover:text-udp-red hover:underline transition-colors"
          >
            EIT UDP
          </a>
        </p>
      </footer>
    </div>
  );
}

interface TopicQuestionPanelProps {
  topic: PrimaryTopic;
  onQuestionClick: (question: string) => void;
  busy: boolean;
  compact?: boolean;
}

function TopicQuestionPanel({
  topic,
  onQuestionClick,
  busy,
  compact = false,
}: TopicQuestionPanelProps) {
  const Icon = topic.icon;

  return (
    <div
      className={`udp-rise flex w-full flex-col items-center justify-center gap-5 ${
        compact ? "rounded-2xl border border-udp-line bg-udp-soft/35 p-4 sm:p-5" : "flex-1 py-8"
      }`}
    >
      <div className="flex max-w-lg flex-col items-center text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-udp-red/10 text-udp-red">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="font-serif text-xl font-semibold tracking-tight text-udp-ink">
          {topic.label}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{topic.description}</p>
      </div>

      <div className="grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {topic.questions.map(({ label, question }, index) => (
          <button
            key={label}
            type="button"
            onClick={() => onQuestionClick(question)}
            disabled={busy}
            title={question}
            className="group flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-udp-line bg-udp-surface px-4 py-3 text-left text-sm font-semibold text-udp-ink outline-none transition-[transform,color,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-udp-red/40 hover:bg-udp-red/5 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-udp-red disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-udp-red/10 text-[10px] font-bold tabular-nums text-udp-red">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{label}</span>
            </span>
            <ArrowUpRight
              className="h-4 w-4 flex-shrink-0 text-udp-red/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={1.75}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
