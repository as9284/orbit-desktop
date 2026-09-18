import { cn } from "../../lib/cn";

/**
 * Orbit brand mark  -  "dimensional depth": two cross-tilted orbit rings, a
 * luminous planet sweeping the front ring, and a glowing star-core.
 * Self-contained gradients (hardcoded to the brand palette) so it renders
 * identically in the app, favicon, and exported icons. Hero-gradient moment.
 */
export function OrbitGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="orbitRing" x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0" stopColor="#7c6cf0" stopOpacity="0.14" />
          <stop offset="0.45" stopColor="#b9aef9" stopOpacity="0.55" />
          <stop offset="1" stopColor="#d9d2fb" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="orbitNode" x1="0.1" y1="0.05" x2="0.9" y2="1">
          <stop offset="0" stopColor="#d9d2fb" />
          <stop offset="0.4" stopColor="#7c6cf0" />
          <stop offset="1" stopColor="#5486e8" />
        </linearGradient>
        <radialGradient id="orbitNodeGlow">
          <stop offset="0" stopColor="#7c6cf0" stopOpacity="0.8" />
          <stop offset="0.5" stopColor="#7c6cf0" stopOpacity="0.25" />
          <stop offset="1" stopColor="#7c6cf0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="orbitCore" cx="0.42" cy="0.4" r="0.65">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#e8e3fc" />
          <stop offset="1" stopColor="#7c6cf0" />
        </radialGradient>
        <radialGradient id="orbitCoreGlow">
          <stop offset="0" stopColor="#b9aef9" stopOpacity="0.65" />
          <stop offset="1" stopColor="#b9aef9" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Faint back ring  -  cross tilt for depth */}
      <ellipse
        cx="16"
        cy="16"
        rx="9.5"
        ry="5"
        transform="rotate(28 16 16)"
        fill="none"
        stroke="#7c6cf0"
        strokeOpacity="0.18"
        strokeWidth="0.7"
      />
      {/* Front ring + planet */}
      <g transform="rotate(-24 16 16)">
        <ellipse
          cx="16"
          cy="16"
          rx="10"
          ry="4"
          fill="none"
          stroke="url(#orbitRing)"
          strokeWidth="1.05"
        />
        <circle cx="26" cy="16" r="5" fill="url(#orbitNodeGlow)" />
        <circle cx="26" cy="16" r="1.7" fill="url(#orbitNode)" />
        <circle
          cx="26"
          cy="16"
          r="1.7"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.4"
          strokeWidth="0.25"
        />
        <circle cx="25.4" cy="15.4" r="0.55" fill="#ffffff" fillOpacity="0.92" />
      </g>
      {/* Star-core */}
      <circle cx="16" cy="16" r="6" fill="url(#orbitCoreGlow)" />
      <circle cx="16" cy="16" r="1.5" fill="url(#orbitCore)" />
    </svg>
  );
}

/** Glyph in a premium tile (matches the sidebar / favicon container). */
export function OrbitMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-xl border border-border-default bg-tint-2 select-none",
        className,
      )}
    >
      <span className="absolute inset-0 rounded-xl bg-accent/8 blur-lg" />
      <OrbitGlyph className="relative h-1/2 w-1/2" />
    </span>
  );
}

/** Full lockup: tiled glyph + "Orbit" wordmark in the display face. */
export function Logo({
  className = "",
  markClassName = "h-10 w-10",
  wordClassName = "text-xl",
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <OrbitMark className={markClassName} />
      <span
        className={cn(
          "font-display font-semibold tracking-tight text-text-primary",
          wordClassName,
        )}
      >
        Orbit
      </span>
    </div>
  );
}
