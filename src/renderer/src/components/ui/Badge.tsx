import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type BadgeColor =
  | "accent"
  | "blue"
  | "amber"
  | "rose"
  | "emerald"
  | "cyan"
  | "neutral";

const colors: Record<BadgeColor, string> = {
  accent: "bg-accent-muted text-accent-text",
  blue: "bg-blue-500/15 text-blue-300",
  amber: "bg-amber-500/15 text-amber-300",
  rose: "bg-rose-500/15 text-rose-300",
  emerald: "bg-emerald-500/15 text-emerald-300",
  cyan: "bg-cyan-500/15 text-cyan-200",
  neutral: "bg-tint-2 text-text-muted",
};

interface BadgeProps {
  color?: BadgeColor;
  /** Show a leading status dot in the current color. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({
  color = "neutral",
  dot = false,
  className = "",
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11px] font-medium",
        colors[color],
        className,
      )}
    >
      {dot && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
      )}
      {children}
    </span>
  );
}
