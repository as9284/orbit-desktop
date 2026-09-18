// Centralized task-priority styling. Single source of truth replacing the
// per-file PRIORITY_STYLES / PRIORITIES / PRIORITY_ORDER copies that were
// previously redefined in TaskCard, CreateTaskModal, EditTaskModal and
// DashboardPage. Class strings are literal so Tailwind's scanner emits them.

export type Priority = "low" | "medium" | "high";

interface PriorityStyle {
  label: string;
  /** Sort weight  -  high first. */
  order: number;
  /** Small status dot fill. */
  dot: string;
  /** Inline priority label text color. */
  labelText: string;
  /** Card left-accent border color. */
  borderL: string;
  /** Soft inset left indicator bar (glassy alternative to a hard border). */
  bar: string;
  /** Priority picker button  -  idle state. */
  buttonIdle: string;
  /** Priority picker button  -  active/selected state. */
  buttonActive: string;
}

export const PRIORITY: Record<Priority, PriorityStyle> = {
  low: {
    label: "Low",
    order: 2,
    dot: "bg-blue-400/70",
    labelText: "text-blue-400/60",
    borderL: "border-l-blue-500/30",
    bar: "bg-blue-400/60",
    buttonIdle:
      "text-white/35 border-white/8 hover:border-blue-500/25 hover:bg-blue-500/4",
    buttonActive:
      "text-blue-400 border-blue-500/35 bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)]",
  },
  medium: {
    label: "Medium",
    order: 1,
    dot: "bg-amber-400/80",
    labelText: "text-amber-400/60",
    borderL: "border-l-amber-500/35",
    bar: "bg-amber-400/70",
    buttonIdle:
      "text-white/35 border-white/8 hover:border-amber-500/25 hover:bg-amber-500/4",
    buttonActive:
      "text-amber-400 border-amber-500/35 bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.12)]",
  },
  high: {
    label: "High",
    order: 0,
    dot: "bg-rose-400",
    labelText: "text-rose-400/65",
    borderL: "border-l-rose-500/45",
    bar: "bg-rose-400/80",
    buttonIdle:
      "text-white/35 border-white/8 hover:border-rose-500/25 hover:bg-rose-500/4",
    buttonActive:
      "text-rose-400 border-rose-500/35 bg-rose-500/10 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.12)]",
  },
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: PRIORITY.high.order,
  medium: PRIORITY.medium.order,
  low: PRIORITY.low.order,
};

/** Ordered list for rendering the priority picker (low → high). */
export const PRIORITY_LIST: Priority[] = ["low", "medium", "high"];
