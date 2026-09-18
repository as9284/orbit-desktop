import { StarField } from "../ui/StarField";

/**
 * Layer 0  -  the immersive cosmic backdrop the calm UI floats above.
 * Sits behind all content (-z-10) so the foreground can stay flat and precise.
 * Holds a focal vignette, the animated starfield, and two soft nebula glows.
 */
export function CosmicBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {/* Focal vignette  -  content floats on a subtle pool of light */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(255,255,255,0.022),transparent_62%)]" />
      <StarField />
      {/* Nebula glows */}
      <div className="absolute top-0 right-1/4 h-100 w-150 rounded-full bg-accent/5 blur-[120px]" />
      <div className="absolute bottom-1/4 left-1/3 h-125 w-125 rounded-full bg-accent-2/4 blur-[100px]" />
    </div>
  );
}
