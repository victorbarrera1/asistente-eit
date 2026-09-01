import { useState } from "react";
import { MessageSquare, X } from "lucide-react";

interface WidgetLauncherProps {
  widgetUrl?: string;
  buttonColor?: string;
  theme?: "light" | "dark";
}

export function WidgetLauncher({
  widgetUrl = "/widget",
  buttonColor = "bg-udp-red",
  theme = "light",
}: WidgetLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 font-sans no-print">
      {/* Chat Window Container */}
      {isOpen && (
        <div className="flex h-[600px] w-[400px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-udp-line bg-udp-surface shadow-[0_12px_40px_rgba(0,0,0,0.15)] animate-in slide-in-from-bottom-5 duration-300">
          <iframe
            src={`${widgetUrl}?theme=${theme}`}
            className="h-full w-full border-0"
            title="Asistente EIT UDP"
          />
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Cerrar chat" : "Abrir chat"}
        className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.25)] transition-all hover:scale-105 active:scale-95 cursor-pointer ${buttonColor}`}
      >
        {isOpen ? (
          <X className="h-6 w-6 animate-in spin-in-90 duration-200" />
        ) : (
          <MessageSquare className="h-6 w-6 animate-in zoom-in-50 duration-200" />
        )}
      </button>
    </div>
  );
}
