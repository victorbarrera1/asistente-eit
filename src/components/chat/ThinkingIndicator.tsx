const THINKING_STEPS = [
  "Buscando en fuentes oficiales de la UDP… 🔍",
  "Analizando documentos de la EIT… 📄",
  "Redactando respuesta… ✍️",
];

interface ThinkingIndicatorProps {
  thinkingStep: number;
}

export function ThinkingIndicator({ thinkingStep }: ThinkingIndicatorProps) {
  return (
    <div className="udp-rise flex max-w-[82%] flex-col gap-1.5 self-start">
      <span className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground">
        Asistente UDP
      </span>
      <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-udp-line bg-udp-soft/60 px-4 py-3.5 relative overflow-hidden">
        {/* Shimmer effect */}
        <div className="absolute inset-0 -translate-x-full animate-[udp-shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-udp-red/[0.04] to-transparent" />
        <span className="flex items-center gap-1.5 relative z-10">
          <Dot delay="0s" />
          <Dot delay="0.2s" />
          <Dot delay="0.4s" />
        </span>
        <span className="text-xs text-muted-foreground relative z-10">
          {THINKING_STEPS[thinkingStep]}
        </span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-2 w-2 rounded-full bg-udp-red/50"
      style={{ animation: "udp-bop 1.2s ease-in-out infinite", animationDelay: delay }}
    />
  );
}

export { THINKING_STEPS };
