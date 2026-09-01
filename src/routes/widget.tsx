import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import {
  splitSuggestions,
  splitSources,
  parseMarkdown,
  SourceCards,
} from "@/components/chat/markdown";
import { ThinkingIndicator, THINKING_STEPS } from "@/components/chat/ThinkingIndicator";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat-limits";

export const Route = createFileRoute("/widget")({
  head: () => ({
    meta: [
      { title: "Asistente EIT UDP — Widget" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WidgetPage,
});

interface WidgetMessage {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
}

const WELCOME_CONTENT =
  "¡Hola! 👋 Soy el asistente de la EIT UDP. Pregúntame sobre prácticas, titulación, reglamentos y más.";

function WidgetPage() {
  const [title, setTitle] = useState("Asistente EIT UDP");
  const [messages, setMessages] = useState<WidgetMessage[]>([
    { role: "assistant", content: WELCOME_CONTENT },
  ]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);

      const themeParam = params.get("theme");
      if (themeParam === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }

      // El parámetro `welcome` se eliminó a propósito.
      //
      // Su contenido se insertaba como mensaje con role "assistant", y los mensajes
      // del asistente se renderizan con parseMarkdown(), que convierte `[texto](url)`
      // en un <a> clicable. Cualquiera podía armar una URL como
      //   /widget?welcome=Verifica+tu+cuenta+[aquí](https://sitio-falso)
      // y obtener un mensaje con la identidad visual oficial de la UDP, en un dominio
      // oficial, con un link de phishing dentro. isSafeUrl() bloquea `javascript:`,
      // pero no impide apuntar a un https:// arbitrario, así que no ayudaba acá.
      //
      // El mensaje de bienvenida ahora es siempre WELCOME_CONTENT, definido en el código.

      // `title` sí se conserva (la escuela lo usa para rotular el widget según dónde
      // lo embebe), pero acotado: solo texto plano, sin markdown y con largo limitado,
      // para que no sirva de lienzo de suplantación.
      const titleParam = params.get("title");
      if (titleParam) {
        // Se descartan caracteres de control y la sintaxis que parseMarkdown
        // interpreta, y se acota el largo. El <h1> ya escapa por ser JSX, así que
        // esto es contra suplantación visual, no contra XSS.
        const safeTitle = Array.from(titleParam)
          .filter((ch) => {
            const code = ch.codePointAt(0) ?? 0;
            return code >= 0x20 && code !== 0x7f && !"[]()*_`#".includes(ch);
          })
          .join("")
          .trim()
          .slice(0, 60);
        if (safeTitle) setTitle(safeTitle);
      }
    }
  }, []);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  }, [messages, typing]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    const userMsg: WidgetMessage = { role: "user", content: trimmed };
    const nextHistory = [...messages.slice(1), userMsg];
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

      if (res.ok && res.body) {
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
            setMessages((prev) => [...prev, { role: "assistant", content: acc }]);
          } else {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: acc };
              return copy;
            });
          }
        }

        if (started) {
          const { body, suggestions } = splitSuggestions(acc);
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: body, suggestions };
            return copy;
          });
        } else {
          setTyping(false);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "⚠️ Sin respuesta. Intenta de nuevo." },
          ]);
        }
      } else {
        throw new Error("Error del servidor");
      }
    } catch (e) {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Error de conexión. Intenta de nuevo." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSend() {
    if (input.length > MAX_CHAT_MESSAGE_LENGTH) return;
    const text = input;
    setInput("");
    void sendMessage(text);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-udp-canvas font-sans text-udp-ink">
      {/* Widget header */}
      <div className="flex items-center gap-2.5 border-b border-udp-line bg-udp-surface px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-udp-red/10 text-udp-red">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 leading-tight">
          <h1 className="text-sm font-semibold text-udp-ink">{title}</h1>
          <p className="text-[10px] text-muted-foreground">Información oficial verificada</p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="udp-scroll flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 scroll-smooth"
      >
        {messages.map((m, i) => {
          const { body, sources } =
            m.role === "assistant"
              ? splitSources(m.content)
              : { body: m.content, sources: [] as string[] };
          return (
            <div
              key={i}
              className={`udp-rise flex max-w-[90%] flex-col gap-1 ${
                m.role === "user" ? "items-end self-end" : "items-start self-start"
              }`}
            >
              <div
                className={`px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "rounded-2xl rounded-br-sm bg-udp-red text-white"
                    : "rounded-2xl rounded-bl-sm border border-udp-line bg-udp-soft/60 text-udp-ink"
                }`}
              >
                {m.role === "assistant" ? parseMarkdown(body) : m.content}
                {m.role === "assistant" && <SourceCards sources={sources} />}
              </div>

              {/* Follow-up suggestions */}
              {m.role === "assistant" && m.suggestions && m.suggestions.length > 0 && !busy && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {m.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => void sendMessage(s)}
                      className="rounded-full border border-udp-line bg-udp-surface px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-udp-red/30 hover:text-udp-ink cursor-pointer transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {typing && <ThinkingIndicator thinkingStep={thinkingStep} />}
      </div>

      {/* Input */}
      <div className="border-t border-udp-line bg-udp-surface px-3 pb-3 pt-2">
        <div className="flex items-center gap-1.5 rounded-xl border border-udp-line bg-udp-soft/50 p-1 focus-within:border-udp-red/40">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Escribe tu pregunta…"
            autoComplete="off"
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            className="flex-1 bg-transparent px-2.5 py-1.5 text-xs text-udp-ink outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={handleSend}
            disabled={busy || !input.trim() || input.length > MAX_CHAT_MESSAGE_LENGTH}
            aria-label="Enviar"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-udp-red text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-30"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
