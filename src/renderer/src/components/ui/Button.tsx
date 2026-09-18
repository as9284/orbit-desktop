import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 focus-ring disabled:opacity-50 disabled:cursor-not-allowed";

const sizes: Record<Size, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-sm",
};

// `primary` keeps the violet→blue gradient  -  one of the reserved hero moments.
const variants: Record<Variant, string> = {
  primary:
    "bg-linear-to-r from-accent to-accent-2 text-white shadow-lg shadow-accent/15 hover:brightness-110 active:scale-[0.98]",
  secondary:
    "font-medium text-text-muted border border-border-default hover:bg-tint-1 hover:text-text-secondary",
  ghost: "font-medium text-text-muted hover:bg-tint-2 hover:text-text-primary",
  danger:
    "text-danger border border-danger/20 bg-danger/10 hover:bg-danger/15",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(base, sizes[size], variants[variant], className)}
    >
      {loading && <Spinner size={size === "sm" ? 13 : 15} />}
      {children}
    </button>
  );
}
