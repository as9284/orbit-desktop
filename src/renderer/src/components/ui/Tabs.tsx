import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}

/** Segmented control  -  active segment uses the reserved hero gradient. */
export function Tabs({ tabs, value, onChange, className = "", ariaLabel }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 overflow-x-auto rounded-xl border border-border-subtle bg-tint-2 p-1 no-scrollbar",
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition-all duration-200 focus-ring",
              active
                ? "bg-linear-to-r from-accent to-accent-2 text-white shadow-sm shadow-accent/15"
                : "text-text-muted hover:bg-tint-1 hover:text-text-secondary",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
