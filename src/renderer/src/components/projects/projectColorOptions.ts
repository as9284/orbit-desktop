import type { ProjectColor } from "../../types/orbit";

export const PROJECT_COLOR_OPTIONS: {
  value: ProjectColor;
  label: string;
  bg: string;
  ring: string;
}[] = [
  {
    value: "violet",
    label: "Violet",
    bg: "bg-violet-500",
    ring: "ring-violet-400",
  },
  {
    value: "purple",
    label: "Purple",
    bg: "bg-purple-500",
    ring: "ring-purple-400",
  },
  {
    value: "indigo",
    label: "Indigo",
    bg: "bg-indigo-500",
    ring: "ring-indigo-400",
  },
  { value: "blue", label: "Blue", bg: "bg-blue-500", ring: "ring-blue-400" },
  { value: "sky", label: "Sky", bg: "bg-sky-500", ring: "ring-sky-400" },
  { value: "cyan", label: "Cyan", bg: "bg-cyan-500", ring: "ring-cyan-400" },
  { value: "teal", label: "Teal", bg: "bg-teal-500", ring: "ring-teal-400" },
  {
    value: "emerald",
    label: "Emerald",
    bg: "bg-emerald-500",
    ring: "ring-emerald-400",
  },
  { value: "lime", label: "Lime", bg: "bg-lime-500", ring: "ring-lime-400" },
  {
    value: "amber",
    label: "Amber",
    bg: "bg-amber-500",
    ring: "ring-amber-400",
  },
  {
    value: "orange",
    label: "Orange",
    bg: "bg-orange-500",
    ring: "ring-orange-400",
  },
  { value: "red", label: "Red", bg: "bg-red-500", ring: "ring-red-400" },
  { value: "rose", label: "Rose", bg: "bg-rose-500", ring: "ring-rose-400" },
  { value: "pink", label: "Pink", bg: "bg-pink-500", ring: "ring-pink-400" },
  {
    value: "fuchsia",
    label: "Fuchsia",
    bg: "bg-fuchsia-500",
    ring: "ring-fuchsia-400",
  },
];

// ── Card-surface color classes ──────────────────────────────────────────────
// Single source of truth for project-colored UI (dot, progress bar, card
// border, ambient glow, badge). Replaces the duplicate COLOR_CLASSES maps
// formerly in ProjectsPage, ProjectDetailModal and CreateProjectModal.
// Literal strings only  -  Tailwind cannot see interpolated class names.

export interface ProjectColorClasses {
  /** Solid status dot. */
  dot: string;
  /** Progress-bar fill. */
  bar: string;
  /** Card outline color. */
  border: string;
  /** Ambient card glow (shadow color). */
  glow: string;
  /** Pill / chip styling. */
  badge: string;
}

export const PROJECT_COLOR_CLASSES: Record<string, ProjectColorClasses> = {
  violet: { dot: "bg-violet-500", bar: "bg-violet-500/70", border: "border-violet-500/25", glow: "shadow-violet-500/10", badge: "bg-violet-500/15 text-violet-300" },
  purple: { dot: "bg-purple-500", bar: "bg-purple-500/70", border: "border-purple-500/25", glow: "shadow-purple-500/10", badge: "bg-purple-500/15 text-purple-300" },
  indigo: { dot: "bg-indigo-500", bar: "bg-indigo-500/70", border: "border-indigo-500/25", glow: "shadow-indigo-500/10", badge: "bg-indigo-500/15 text-indigo-300" },
  blue: { dot: "bg-blue-500", bar: "bg-blue-500/70", border: "border-blue-500/25", glow: "shadow-blue-500/10", badge: "bg-blue-500/15 text-blue-300" },
  sky: { dot: "bg-sky-500", bar: "bg-sky-500/70", border: "border-sky-500/25", glow: "shadow-sky-500/10", badge: "bg-sky-500/15 text-sky-300" },
  cyan: { dot: "bg-cyan-500", bar: "bg-cyan-500/70", border: "border-cyan-500/25", glow: "shadow-cyan-500/10", badge: "bg-cyan-500/15 text-cyan-300" },
  teal: { dot: "bg-teal-500", bar: "bg-teal-500/70", border: "border-teal-500/25", glow: "shadow-teal-500/10", badge: "bg-teal-500/15 text-teal-300" },
  emerald: { dot: "bg-emerald-500", bar: "bg-emerald-500/70", border: "border-emerald-500/25", glow: "shadow-emerald-500/10", badge: "bg-emerald-500/15 text-emerald-300" },
  lime: { dot: "bg-lime-500", bar: "bg-lime-500/70", border: "border-lime-500/25", glow: "shadow-lime-500/10", badge: "bg-lime-500/15 text-lime-300" },
  amber: { dot: "bg-amber-500", bar: "bg-amber-500/70", border: "border-amber-500/25", glow: "shadow-amber-500/10", badge: "bg-amber-500/15 text-amber-300" },
  orange: { dot: "bg-orange-500", bar: "bg-orange-500/70", border: "border-orange-500/25", glow: "shadow-orange-500/10", badge: "bg-orange-500/15 text-orange-300" },
  red: { dot: "bg-red-500", bar: "bg-red-500/70", border: "border-red-500/25", glow: "shadow-red-500/10", badge: "bg-red-500/15 text-red-300" },
  rose: { dot: "bg-rose-500", bar: "bg-rose-500/70", border: "border-rose-500/25", glow: "shadow-rose-500/10", badge: "bg-rose-500/15 text-rose-300" },
  pink: { dot: "bg-pink-500", bar: "bg-pink-500/70", border: "border-pink-500/25", glow: "shadow-pink-500/10", badge: "bg-pink-500/15 text-pink-300" },
  fuchsia: { dot: "bg-fuchsia-500", bar: "bg-fuchsia-500/70", border: "border-fuchsia-500/25", glow: "shadow-fuchsia-500/10", badge: "bg-fuchsia-500/15 text-fuchsia-300" },
};

/**
 * Resolve a project's color (named or `#hex`) to its card classes.
 * For hex colors, class strings are empty and `hex` carries the raw value so
 * callers can apply it via inline style (matching the prior behavior).
 */
export function getProjectColorClasses(
  color: string,
): ProjectColorClasses & { hex: string | null } {
  if (color.startsWith("#")) {
    return {
      dot: "",
      bar: "",
      border: "border-border-default",
      glow: "",
      badge: "",
      hex: color,
    };
  }
  return {
    ...(PROJECT_COLOR_CLASSES[color] ?? PROJECT_COLOR_CLASSES.violet),
    hex: null,
  };
}
