import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface StatPillProps {
  icon: ReactNode;
  value: number;
  label: string;
  /** Color class for the icon (semantic per stat). */
  iconClass: string;
  dim?: boolean;
}

export function StatPill({ icon, value, label, iconClass, dim = false }: StatPillProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-xl glass px-3 py-1.5 transition-opacity duration-200",
        dim && "opacity-40",
      )}
    >
      <span className={iconClass}>{icon}</span>
      <span className="font-display text-sm font-bold leading-none tabular-nums text-text-primary">
        {value}
      </span>
      <span className="text-[10px] font-medium leading-none text-text-faint">
        {label}
      </span>
    </div>
  );
}
