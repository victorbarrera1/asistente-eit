import type React from "react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

/**
 * Botón "Liquid Metal" con seguimiento de mouse y brillo dinámico.
 * Adaptado de una librería de referencia (3D Liquid Metal Buttons) para:
 * - Soportar modo claro ("Platino/Cristal": grises suaves + reflejos blancos)
 *   y modo oscuro ("Grafito": gradientes oscuros del original).
 * - Usar el rojo institucional UDP como color de brillo por defecto.
 * - Throttlear el tracking del mouse con requestAnimationFrame para no
 *   disparar un re-render de React en cada pixel de movimiento.
 */

export type LiquidMetalAnimation =
  | "slide-right"
  | "bounce"
  | "zoom"
  | "spin"
  | "wave"
  | "shake"
  | "heartbeat"
  | "spread"
  | "drop"
  | "pulse"
  | "rotate-in"
  | "flip"
  | "flash"
  | "bounce-beat"
  | "record"
  | "slide-down"
  | "lock-shake"
  | "signal"
  | "phase"
  | "spark"
  | "rotate"
  | "float"
  | "pulse-ring"
  | "fly";

/**
 * Hook liviano de seguimiento de mouse, throttleado a un setState por frame
 * (requestAnimationFrame) en vez de uno por evento. Pensado para aplicar un
 * halo de luz sutil (glassmorphism) sobre superficies que NO son el botón
 * metálico completo (ej. tarjetas rectangulares), evitando el costo de
 * re-render de un tracking sin throttle en múltiples elementos a la vez.
 */
export function useMouseGlow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef({ x: 0, y: 0 });

  const onMouseMove = useCallback((e: React.MouseEvent<T>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    pendingRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      setPos(pendingRef.current);
      rafRef.current = null;
    });
  }, []);

  const onMouseEnter = useCallback(() => setHovering(true), []);
  const onMouseLeave = useCallback(() => setHovering(false), []);

  return {
    ref,
    pos,
    hovering,
    handlers: { onMouseMove, onMouseEnter, onMouseLeave },
  };
}

interface LiquidMetalButtonProps {
  icon: LucideIcon;
  animationType?: LiquidMetalAnimation;
  size?: "sm" | "md" | "lg";
  /** Tono del brillo/glow: "udp" (rojo institucional) o "neutral" (plata/blanco). */
  glow?: "udp" | "neutral";
  onClick?: () => void;
  "aria-label"?: string;
  title?: string;
  disabled?: boolean;
}

const UDP_GLOW = "rgba(211, 18, 69, 0.85)"; // #D31245

const getClickAnimation = (type: string): React.CSSProperties => {
  const animations: Record<string, React.CSSProperties> = {
    "slide-right": { transform: "translateX(8px) scale(1.2)" },
    bounce: { transform: "translateY(-10px) scale(1.2)" },
    zoom: { transform: "scale(1.5)" },
    spin: { transform: "rotate(180deg) scale(1.1)" },
    wave: { transform: "rotate(-15deg) scale(1.2)" },
    shake: { transform: "rotate(20deg) scale(1.2)" },
    heartbeat: { transform: "scale(1.4)" },
    spread: { transform: "scale(1.3) rotate(15deg)" },
    drop: { transform: "translateY(6px) scale(1.2)" },
    pulse: { transform: "scale(1.4)" },
    "rotate-in": { transform: "rotate(90deg) scale(1.3)" },
    flip: { transform: "rotateY(180deg) scale(1.2)" },
    flash: { transform: "scale(1.5)" },
    "bounce-beat": { transform: "translateY(-6px) scale(1.2)" },
    record: { transform: "scale(1.3)" },
    "slide-down": { transform: "translateY(4px) scale(1.2)" },
    "lock-shake": { transform: "translateX(4px) scale(1.2)" },
    signal: { transform: "scale(1.3)" },
    phase: { transform: "rotate(-30deg) scale(1.2)" },
    spark: { transform: "scale(1.4) rotate(15deg)" },
    rotate: { transform: "rotate(360deg) scale(1.1)" },
    float: { transform: "translateY(-8px) scale(1.2)" },
    "pulse-ring": { transform: "scale(1.3)" },
    fly: { transform: "translate(10px, -10px) scale(1.2)" },
  };
  return animations[type] || { transform: "scale(1.3) rotate(15deg)" };
};

const sizeConfig = {
  sm: { padding: "px-3 py-3", icon: "h-3.5 w-3.5", glow: "60px", ambient: "-inset-4" },
  md: { padding: "px-4 py-4", icon: "h-4 w-4", glow: "80px", ambient: "-inset-6" },
  lg: { padding: "px-6 py-6", icon: "h-6 w-6", glow: "100px", ambient: "-inset-8" },
} as const;

export function LiquidMetalButton({
  icon: Icon,
  animationType = "slide-right",
  size = "sm",
  glow = "udp",
  onClick,
  disabled,
  ...rest
}: LiquidMetalButtonProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [shakePhase, setShakePhase] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPosRef = useRef({ x: 0, y: 0 });

  const config = sizeConfig[size];
  const glowColor = glow === "udp" ? UDP_GLOW : "rgba(255, 255, 255, 0.9)";

  // Throttle del tracking de mouse vía requestAnimationFrame: la posición se
  // guarda en un ref en cada evento (barato), pero el setState (que dispara
  // el re-render) solo ocurre una vez por frame, no una vez por pixel.
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    pendingPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      setMousePosition(pendingPosRef.current);
      rafRef.current = null;
    });
  }, []);

  const handleClick = useCallback(() => {
    if (disabled) return;
    setIsClicked(true);

    if (animationType === "shake" || animationType === "lock-shake") {
      let count = 0;
      const shakeInterval = setInterval(() => {
        setShakePhase((prev) => (prev === 1 ? -1 : 1));
        count++;
        if (count >= 6) {
          clearInterval(shakeInterval);
          setShakePhase(0);
        }
      }, 50);
    }

    onClick?.();
    setTimeout(() => setIsClicked(false), 500);
  }, [animationType, disabled, onClick]);

  const clickAnimationStyle = getClickAnimation(animationType);

  const getIconTransform = () => {
    if (isClicked) {
      if ((animationType === "shake" || animationType === "lock-shake") && shakePhase !== 0) {
        return `translateX(${shakePhase * 4}px) scale(1.2)`;
      }
      return clickAnimationStyle.transform;
    }
    if (isPressed) return "scale(0.95)";
    if (isHovering) return "scale(1.05)";
    return "scale(1)";
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onClick={handleClick}
      className="group relative inline-flex items-center justify-center touch-manipulation disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        transform: isPressed ? "translateY(2px)" : "translateY(0)",
        transition: "transform 0.1s ease-out",
      }}
      {...rest}
    >
      {/* Halo ambiental que sigue al mouse */}
      <div
        className={`pointer-events-none absolute ${config.ambient} rounded-full blur-2xl transition-opacity duration-500`}
        style={{
          background: `radial-gradient(160px circle at ${mousePosition.x + 20}px ${mousePosition.y + 20}px, ${glowColor.replace("0.85", "0.18").replace("0.9", "0.18")}, transparent 60%)`,
          opacity: isHovering && !disabled ? (isPressed ? 0.5 : 1) : 0,
        }}
      />

      {/* Marco metálico exterior — claro (Platino) por defecto, oscuro vía dark: */}
      <div
        className="relative rounded-full bg-gradient-to-b from-slate-200 to-slate-300 p-[3px] transition-all duration-100 dark:from-[#1a1a1a] dark:to-[#0a0a0a]"
        style={{
          boxShadow: isPressed
            ? "0 4px 10px rgba(15,23,42,0.18), 0 1px 3px rgba(15,23,42,0.12)"
            : "0 12px 24px rgba(15,23,42,0.16), 0 4px 10px rgba(15,23,42,0.10)",
        }}
      >
        <div className="relative overflow-hidden rounded-full p-[2px]">
          {/* Base metálica: cristal claro / grafito oscuro */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white via-slate-100 to-slate-200 dark:from-[#4a4a4a] dark:via-[#2a2a2a] dark:to-[#3a3a3a]" />

          {/* Reflejo especular que sigue el cursor */}
          <div
            className="absolute inset-0 rounded-full transition-opacity duration-150"
            style={{
              background:
                isHovering && !disabled
                  ? `radial-gradient(${config.glow} circle at ${mousePosition.x}px ${mousePosition.y}px,
                      rgba(255, 255, 255, 0.95) 0%,
                      rgba(255, 255, 255, 0.55) 25%,
                      rgba(220, 230, 255, 0.25) 50%,
                      transparent 70%)`
                  : "transparent",
              opacity: isPressed ? 1.2 : 1,
            }}
          />

          <div className="relative overflow-hidden rounded-full">
            {/* Brillo de clic (color institucional o neutral) */}
            <div
              className="absolute inset-0 rounded-full transition-all"
              style={{
                background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                transform: isClicked ? "scale(2)" : "scale(0)",
                opacity: isClicked ? 0 : 1,
                transition: "transform 0.5s ease-out, opacity 0.5s ease-out",
              }}
            />

            {/* Superficie interior del botón */}
            <div
              className={`relative rounded-full bg-gradient-to-b from-slate-50 to-white ${config.padding} transition-all duration-100 dark:from-[#252525] dark:to-[#181818]`}
              style={{
                boxShadow: isPressed
                  ? "inset 0 6px 14px rgba(15,23,42,0.12), inset 0 2px 6px rgba(15,23,42,0.08)"
                  : "inset 0 3px 8px rgba(15,23,42,0.06), inset 0 -1px 3px rgba(255,255,255,0.6)",
              }}
            >
              <div
                className="absolute inset-x-0 top-0 h-1/3 rounded-t-full bg-gradient-to-b from-white/80 via-white/20 to-transparent transition-opacity duration-100 dark:from-white/8 dark:via-white/2"
                style={{ opacity: isPressed ? 0.3 : 1 }}
              />
              <div className="absolute inset-x-0 bottom-0 h-1/4 rounded-b-full bg-gradient-to-t from-slate-900/10 to-transparent dark:from-black/30" />

              <Icon
                className={`relative z-10 ${config.icon} text-slate-600 transition-colors group-hover:text-udp-red dark:text-gray-400 dark:group-hover:text-gray-300`}
                strokeWidth={1.75}
                style={{
                  transform: getIconTransform(),
                  filter: isClicked
                    ? `drop-shadow(0 0 12px ${glowColor})`
                    : isPressed
                      ? "drop-shadow(0 0 8px rgba(211,18,69,0.35))"
                      : isHovering
                        ? "drop-shadow(0 0 5px rgba(211,18,69,0.25))"
                        : "none",
                  transition:
                    animationType === "spin" || animationType === "rotate"
                      ? "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s ease-out, filter 0.15s ease-out"
                      : "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s ease-out, filter 0.15s ease-out",
                }}
              />

              <div className="absolute inset-0 rounded-full border border-slate-300/50 dark:border-gray-600/20" />
              <div
                className="absolute inset-0 rounded-full bg-slate-900/5 transition-opacity duration-100 dark:bg-white/5"
                style={{ opacity: isPressed ? 1 : 0 }}
              />
            </div>
          </div>
        </div>

        {/* Filo especular superior */}
        <div
          className="absolute inset-x-6 top-1 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/70 to-transparent transition-opacity duration-100 dark:via-white/20"
          style={{ opacity: isPressed ? 0 : 1 }}
        />
      </div>
    </button>
  );
}
