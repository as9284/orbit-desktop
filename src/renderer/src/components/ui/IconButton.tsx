import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name  -  also sets the title for hover. */
  label: string;
  size?: "sm" | "md";
  children: ReactNode;
}

// Larger tap area on mobile (≈37px), original compact size on sm+ desktop.
const sizes = { sm: "p-3 sm:p-1.5", md: "p-3 sm:p-2" } as const;

/** Square ghost button for icon-only actions (close, edit, archive…). */
export function IconButton({
  label,
  size = "sm",
  className = "",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-text-faint transition-all duration-150 hover:bg-tint-3 hover:text-text-primary focus-ring disabled:opacity-50",
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
