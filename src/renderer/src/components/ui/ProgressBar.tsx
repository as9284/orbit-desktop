import { cn } from "../../lib/cn";

interface ProgressBarProps {
  /** 0 - 100. */
  value: number;
  /** Track sizing/spacing override (default height is h-1). */
  className?: string;
  /** Fill color override  -  e.g. a project-colored `bar` class. */
  barClassName?: string;
}

export function ProgressBar({ value, className = "", barClassName }: ProgressBarProps) {
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-tint-3", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700 ease-out",
          barClassName ?? "bg-linear-to-r from-accent to-accent-2",
        )}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
