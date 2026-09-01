import { GraduationCap, RotateCcw, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import udpLogo from "@/assets/udp-logo.png";
import { LiquidMetalButton } from "@/components/ui/LiquidMetalButton";
import type { PrimaryTopic } from "./categories";

interface ChatHeaderProps {
  dark: boolean;
  onToggleTheme: () => void;
  onResetChat: () => void;
  showReset: boolean;
  busy: boolean;
}

export function ChatHeader({ dark, onToggleTheme, onResetChat, showReset, busy }: ChatHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-udp-line bg-udp-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <img
            src={udpLogo}
            alt="Universidad Diego Portales"
            className="h-7 w-auto sm:h-8 dark:brightness-0 dark:invert"
          />
          <span className="hidden h-6 w-px bg-udp-line sm:block" />
          <span className="hidden text-sm font-medium text-muted-foreground sm:block">
            Asistente EIT
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LiquidMetalButton
            icon={dark ? Sun : Moon}
            animationType="phase"
            size="sm"
            glow="neutral"
            onClick={onToggleTheme}
            aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={dark ? "Modo claro" : "Modo oscuro"}
          />
        </div>
      </div>
    </header>
  );
}

interface ChatPanelHeaderProps {
  onResetChat: () => void;
  showReset: boolean;
  busy: boolean;
  topics: PrimaryTopic[];
  activeTopic: string | null;
  onSelectTopic: (topic: PrimaryTopic) => void;
}

export function ChatPanelHeader({
  onResetChat,
  showReset,
  busy,
  topics,
  activeTopic,
  onSelectTopic,
}: ChatPanelHeaderProps) {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/chat", { method: "OPTIONS" });
        if (!cancelled) setOnline(res.ok || res.status === 405 || res.status === 404);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    void check();
    const id = setInterval(() => void check(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="border-b border-udp-line px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-udp-red/10 text-red-700 dark:text-udp-red">
            <GraduationCap className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate font-serif text-[17px] font-semibold tracking-tight text-udp-ink">
              Asistente EIT UDP
            </h1>
            <div className="hidden items-center gap-1.5 sm:flex">
              {online !== null && (
                <span
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    online
                      ? "bg-emerald-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]"
                      : "bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.4)]"
                  }`}
                  title={online ? "Servicio activo" : "Servicio no disponible"}
                />
              )}
              <p className="truncate text-xs text-muted-foreground">
                {online === false
                  ? "Servicio temporalmente no disponible"
                  : "Información oficial verificada"}
              </p>
            </div>
          </div>
        </div>

        <nav
          aria-label="Temas principales"
          className="udp-nav-scroll order-3 w-full sm:order-none sm:ml-auto sm:w-auto sm:max-w-full sm:overflow-x-auto"
        >
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:w-max sm:items-center">
            {topics.map((topic) => {
              const Icon = topic.icon;
              const isActive = activeTopic === topic.label;

              return (
                <button
                  key={topic.label}
                  type="button"
                  onClick={() => onSelectTopic(topic)}
                  disabled={busy}
                  aria-pressed={isActive}
                  className={`flex min-h-10 w-full flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[11px] font-semibold outline-none transition-[color,background-color,border-color,box-shadow] duration-200 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-udp-red disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto ${
                    isActive
                      ? "border-udp-red bg-udp-red text-white shadow-[0_4px_12px_color-mix(in_oklab,var(--udp-red)_35%,transparent)]"
                      : "border-udp-line bg-udp-surface text-udp-ink hover:border-udp-red/40 hover:bg-udp-red/5"
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${isActive ? "text-white" : "text-udp-red"}`}
                    strokeWidth={1.8}
                  />
                  <span>{topic.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {showReset && (
          <button
            type="button"
            onClick={onResetChat}
            disabled={busy}
            title="Nueva conversación"
            aria-label="Nueva conversación"
            className="group ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-udp-line bg-udp-surface text-muted-foreground transition-all duration-200 hover:border-udp-red/30 hover:text-udp-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-0"
          >
            <RotateCcw className="h-3.5 w-3.5 transition-transform duration-500 ease-out group-hover:-rotate-180" />
          </button>
        )}
      </div>
    </div>
  );
}
