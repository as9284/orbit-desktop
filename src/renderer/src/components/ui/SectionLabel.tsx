import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface SectionLabelProps {
  children: ReactNode;
  /** Optional leading icon (e.g. a 12px lucide glyph). */
  icon?: ReactNode;
  className?: string;
}

/** Canonical uppercase micro-label used above form sections and lists. */
export function SectionLabel({ children, icon, className = "" }: SectionLabelProps) {
  return (
    <div className={cn("flex items-center gap-1.5 text-text-faint", className)}>
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-widest">
        {children}
      </span>
    </div>
  );
}
