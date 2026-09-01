import { Send } from "lucide-react";
import { SUGGESTIONS } from "./categories";
import { LiquidMetalButton } from "@/components/ui/LiquidMetalButton";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat-limits";

const MAX_CHARS = MAX_CHAT_MESSAGE_LENGTH;

interface ChatComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onSuggestionClick: (text: string) => void;
  busy: boolean;
  showChips: boolean;
}

export function ChatComposer({
  input,
  onInputChange,
  onSend,
  onSuggestionClick,
  busy,
  showChips,
}: ChatComposerProps) {
  const charCount = input.length;
  const isOverLimit = charCount > MAX_CHARS;

  return (
    <div className="border-t border-udp-line bg-udp-surface px-4 pb-4 pt-3 sm:px-6 no-print">
      {showChips && (
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => onSuggestionClick(label)}
              className="group flex items-center gap-1.5 rounded-full border border-udp-line bg-udp-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-udp-red/40 hover:bg-udp-red/5 hover:text-udp-ink active:scale-95 cursor-pointer"
            >
              <Icon className="h-3.5 w-3.5 text-udp-red/80 transition-colors group-hover:text-udp-red" />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 transition-all focus-within:border-red-600 focus-within:ring-1 focus-within:ring-red-600 focus-within:bg-white dark:border-udp-line dark:bg-udp-soft/50 dark:focus-within:bg-udp-surface">
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isOverLimit) onSend();
            }
          }}
          placeholder="Escribe tu pregunta…"
          autoComplete="off"
          maxLength={MAX_CHARS}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-udp-ink outline-none placeholder:text-muted-foreground"
        />
        <LiquidMetalButton
          icon={Send}
          animationType="fly"
          size="sm"
          glow="udp"
          onClick={onSend}
          disabled={busy || !input.trim() || isOverLimit}
          aria-label="Enviar"
          title="Enviar"
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between px-1">
        <p className="text-[11px] text-muted-foreground">
          Información oficial de la UDP · No reemplaza la asesoría de unidades académicas
        </p>
        {charCount > 0 && (
          <span
            className={`text-[10px] font-medium tabular-nums transition-colors ${
              isOverLimit ? "text-red-500" : "text-muted-foreground/60"
            }`}
          >
            {charCount} / {MAX_CHARS}
          </span>
        )}
      </div>
    </div>
  );
}
