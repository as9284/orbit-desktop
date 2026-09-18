import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

const base =
  "w-full rounded-xl bg-tint-1 border px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-faint outline-none transition-all resize-none focus:bg-tint-2";

export function Textarea({
  hasError = false,
  className = "",
  ...props
}: TextareaProps) {
  return (
    <textarea
      {...props}
      className={cn(
        base,
        hasError ? "border-danger/40" : "border-border-default focus:border-accent/50",
        className,
      )}
    />
  );
}
