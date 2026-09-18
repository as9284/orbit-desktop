/**
 * Cosmic glyph set  -  bespoke celestial icons for the nav, replacing the generic
 * Lucide outlines. Each is a 24-box SVG drawn in `currentColor` so it inherits
 * the rail's text color; `active` lights the core (faint accent fill + heavier
 * stroke) to pair with the rail's active glow. Artwork fills ~3 - 21 of the box
 * so the glyphs read with weight at rail size, like Lucide.
 */
import type { ComponentType } from "react";

export interface CosmicIconProps {
  size?: number;
  active?: boolean;
  className?: string;
}

function Svg({
  size = 22,
  active = false,
  className = "",
  children,
}: CosmicIconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const lit = (active?: boolean) => (active ? "currentColor" : "none");

/** Tasks  -  a ringed planet. */
export function PlanetIcon(p: CosmicIconProps) {
  return (
    <Svg {...p}>
      <circle
        cx="12"
        cy="12"
        r="6"
        fill={lit(p.active)}
        fillOpacity={p.active ? 0.22 : 0}
      />
      <ellipse cx="12" cy="12" rx="11" ry="3.8" transform="rotate(-20 12 12)" />
    </Svg>
  );
}

/** Notes  -  a comet: round head with a tapering tail. */
export function CometIcon(p: CosmicIconProps) {
  return (
    <Svg {...p}>
      {/* tail  -  two strokes converging to a point */}
      <path d="M14 10 L4 20" />
      <path d="M17 12.5 L7 20.5" opacity="0.7" />
      <circle
        cx="16.5"
        cy="7.5"
        r="3.6"
        fill={lit(p.active)}
        fillOpacity={p.active ? 0.25 : 0}
      />
    </Svg>
  );
}

/** Projects  -  a constellation of linked stars. */
export function ConstellationIcon(p: CosmicIconProps) {
  const dot = lit(p.active);
  return (
    <Svg {...p}>
      <path
        d="M4.5 7 L12 3.5 L19.5 8.5 L15 20 L6 16.5 Z"
        strokeWidth={p.active ? 1.6 : 1.4}
        opacity="0.9"
      />
      <circle cx="4.5" cy="7" r="1.8" fill={dot} />
      <circle cx="12" cy="3.5" r="1.9" fill={dot} />
      <circle cx="19.5" cy="8.5" r="1.8" fill={dot} />
      <circle cx="15" cy="20" r="1.9" fill={dot} />
      <circle cx="6" cy="16.5" r="1.7" fill={dot} />
    </Svg>
  );
}

/** Meeting  -  a binary orbit: two bodies sweeping one path. */
export function BinaryOrbitIcon(p: CosmicIconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="12" rx="10.5" ry="5.6" transform="rotate(-20 12 12)" />
      <circle cx="3.7" cy="15" r="2.6" fill="currentColor" fillOpacity={p.active ? 1 : 0.85} />
      <circle cx="20.3" cy="9" r="2.6" fill="currentColor" fillOpacity={p.active ? 1 : 0.85} />
    </Svg>
  );
}

/** Luna  -  a crescent moon with a companion spark. */
export function CrescentIcon(p: CosmicIconProps) {
  return (
    <Svg {...p}>
      <path
        d="M17.5 3.2 A9.2 9.2 0 1 0 17.5 20.8 A7.1 7.1 0 1 1 17.5 3.2 Z"
        fill={lit(p.active)}
        fillOpacity={p.active ? 0.22 : 0}
      />
      <path d="M6.5 5.5 l0.01 0" strokeWidth={p.active ? 3 : 2.6} />
    </Svg>
  );
}

/** Writing  -  a four-point sparkle/star, for composing. */
export function SparkleIcon(p: CosmicIconProps) {
  return (
    <Svg {...p}>
      <path
        d="M12 2.5 C12.7 8.8 15.2 11.3 21.5 12 C15.2 12.7 12.7 15.2 12 21.5 C11.3 15.2 8.8 12.7 2.5 12 C8.8 11.3 11.3 8.8 12 2.5 Z"
        fill={lit(p.active)}
        fillOpacity={p.active ? 0.22 : 0}
      />
      <path d="M19.5 4.5 l0.01 0" strokeWidth={p.active ? 2.8 : 2.4} opacity="0.85" />
    </Svg>
  );
}

/** Archive  -  a collapsing star: dense core with inward ticks. */
export function CollapsedStarIcon(p: CosmicIconProps) {
  return (
    <Svg {...p}>
      <path
        d="M12 5.5 C12.5 10 14 11.5 18.5 12 C14 12.5 12.5 14 12 18.5 C11.5 14 10 12.5 5.5 12 C10 11.5 11.5 10 12 5.5 Z"
        fill="currentColor"
        fillOpacity={p.active ? 0.3 : 0.12}
      />
      <path d="M3.8 3.8 L6.4 6.4" opacity="0.6" />
      <path d="M20.2 3.8 L17.6 6.4" opacity="0.6" />
      <path d="M3.8 20.2 L6.4 17.6" opacity="0.6" />
      <path d="M20.2 20.2 L17.6 17.6" opacity="0.6" />
    </Svg>
  );
}

export type CosmicIcon = ComponentType<CosmicIconProps>;
