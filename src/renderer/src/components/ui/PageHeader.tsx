import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned action (e.g. a primary <Button>). */
  action?: ReactNode;
  className?: string;
}

/** Standard page title block  -  display-font heading + optional subtitle/action. */
export function PageHeader({ title, subtitle, action, className = "" }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="animate-slide-up">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
