import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface EmptyStateProps {
  /** Pre-colored icon node (e.g. <Sparkles className="text-accent/40" />). */
  icon: ReactNode;
  title: string;
  /** Usually a <Button>. */
  action?: ReactNode;
  /** Float the icon for the friendlier "nothing here yet" states. */
  float?: boolean;
}

export function EmptyState({ icon, title, action, float = false }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
      <div
        className={cn(
          "mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border-subtle bg-tint-2",
          float && "animate-float",
        )}
      >
        {icon}
      </div>
      <p className="text-sm font-medium text-text-muted">{title}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
