import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../../lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  /** `default` = boxed field; `bare` = transparent underline (modal titles). */
  variant?: "default" | "bare";
  /** React 19 passes `ref` as a plain prop, so it just needs declaring. */
  ref?: Ref<HTMLInputElement>;
}

const boxed =
  "w-full rounded-xl bg-tint-1 border px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-faint outline-none transition-all focus:bg-tint-2";
const bare =
  "w-full bg-transparent text-base font-medium text-text-primary placeholder:text-text-faint outline-none border-b pb-2.5 transition-colors duration-200";

export function Input({
  hasError = false,
  variant = "default",
  className = "",
  ...props
}: InputProps) {
  const borderState =
    variant === "bare"
      ? hasError
        ? "border-danger/40"
        : "border-border-default focus:border-accent/40"
      : hasError
        ? "border-danger/40"
        : "border-border-default focus:border-accent/50";

  return (
    <input
      {...props}
      className={cn(variant === "bare" ? bare : boxed, borderState, className)}
    />
  );
}
