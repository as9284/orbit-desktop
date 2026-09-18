import { cn } from "../../lib/cn";

interface TooltipProps {
  label: string;
  /** Side the tooltip appears on. Requires a parent with the `group` class. */
  side?: "right" | "top";
  className?: string;
}

/** CSS-only hover tooltip. Render inside an element that has `group`. */
export function Tooltip({ label, side = "right", className = "" }: TooltipProps) {
  const pos =
    side === "right"
      ? "left-[calc(100%+10px)] top-1/2 -translate-y-1/2 -translate-x-2 group-hover:translate-x-0"
      : "bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 translate-y-1 group-hover:translate-y-0";
  const arrow =
    side === "right"
      ? "right-full top-1/2 -translate-y-1/2 border-r-surface-3"
      : "top-full left-1/2 -translate-x-1/2 border-t-surface-3";

  return (
    <span
      className={cn(
        "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-border-strong bg-surface-3 px-2.5 py-1.5 text-xs font-medium text-text-primary opacity-0 shadow-xl shadow-black/50 transition-all duration-150 group-hover:opacity-100",
        pos,
        className,
      )}
      aria-hidden="true"
    >
      {label}
      <span className={cn("absolute border-4 border-transparent", arrow)} />
    </span>
  );
}
