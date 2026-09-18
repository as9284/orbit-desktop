import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift + surface change for clickable cards. */
  interactive?: boolean;
  size?: "sm" | "lg";
}

/** Glass surface card  -  borderless; the cosmos blurs through behind it. */
export function Card({
  interactive = false,
  size = "lg",
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        "glass",
        size === "lg" ? "rounded-2xl" : "rounded-xl",
        interactive && "glass-interactive cursor-pointer",
        className,
      )}
    />
  );
}
