import { useState, useEffect, useRef } from "react";
import { stripMarkdown } from "../../lib/markdown";
import { format, isPast, isToday, parseISO, isTomorrow } from "date-fns";
import { Circle, CheckCircle2, Archive, Pencil, Calendar } from "lucide-react";
import type { Task } from "../../types/orbit";
import { PRIORITY } from "../../lib/theme";
import { IconButton } from "../ui/IconButton";

interface Props {
  task: Task;
  onToggleComplete: (id: string, completed: boolean) => Promise<boolean>;
  onArchive: (id: string) => Promise<boolean>;
  onEdit: (task: Task) => void;
  onPreview?: (task: Task) => void;
}

function getDueDateDisplay(due: string, completed: boolean) {
  const d = parseISO(due);
  if (completed) return { label: format(d, "MMM d"), cls: "text-text-faint" };
  if (isToday(d)) return { label: "Today", cls: "text-amber-400" };
  if (isTomorrow(d)) return { label: "Tomorrow", cls: "text-amber-300/75" };
  if (isPast(d)) return { label: format(d, "MMM d"), cls: "text-danger" };
  return { label: format(d, "MMM d"), cls: "text-text-muted" };
}

export function TaskCard({
  task,
  onToggleComplete,
  onArchive,
  onEdit,
  onPreview,
}: Props) {
  const [toggling, setToggling] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggle = async () => {
    if (toggling) return;
    setToggling(true);
    const willComplete = !task.completed;
    const ok = await onToggleComplete(task.id, willComplete);
    if (ok && willComplete) {
      setJustCompleted(true);
      if (rippleTimer.current) clearTimeout(rippleTimer.current);
      rippleTimer.current = setTimeout(() => setJustCompleted(false), 700);
    }
    setToggling(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rippleTimer.current) clearTimeout(rippleTimer.current);
    };
  }, []);

  const priority = PRIORITY[task.priority];
  const due = task.due_date
    ? getDueDateDisplay(task.due_date, task.completed)
    : null;

  return (
    <div
      className={`group relative flex items-start gap-3 pl-5 pr-4 py-3.5 rounded-2xl glass transition-all duration-200 ${
        task.completed ? "opacity-50" : "glass-interactive"
      }`}
    >
      {/* Soft priority indicator  -  glassy inset bar, not a hard border */}
      <span
        className={`absolute left-2 top-1/2 -translate-y-1/2 h-7 w-1 rounded-full ${priority.bar} ${
          task.completed ? "opacity-40" : ""
        }`}
        aria-hidden="true"
      />

      {/* Checkbox with hover tooltip and completion animation */}
      <div className="relative group/check shrink-0">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`-m-2 p-2 transition-all duration-200 focus-ring rounded-lg ${
            task.completed
              ? "text-emerald-400/50 hover:text-emerald-400/80 hover:bg-emerald-400/8"
              : "text-text-faint hover:text-emerald-400/60 hover:bg-emerald-400/7"
          }`}
          aria-label={task.completed ? "Mark as active" : "Mark as complete"}
          aria-pressed={task.completed}
        >
          <span
            className={`inline-flex ${
              justCompleted ? "animate-check-pop" : ""
            }`}
          >
            {task.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          </span>
          {/* Ripple effect on completion */}
          {justCompleted && (
            <span
              className="absolute inset-0 rounded-lg bg-emerald-400/15 animate-complete-ripple pointer-events-none"
              aria-hidden="true"
            />
          )}
        </button>
        {/* Hover tooltip */}
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-medium bg-black/85 text-text-secondary rounded-md whitespace-nowrap opacity-0 group-hover/check:opacity-100 pointer-events-none transition-opacity duration-150 z-20"
          aria-hidden="true"
        >
          {task.completed ? "Mark active" : "Mark complete"}
        </span>
      </div>

      {/* Content */}
      <div
        className="flex-1 min-w-0 cursor-pointer select-none"
        onClick={() => (onPreview ?? onEdit)(task)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            (onPreview ?? onEdit)(task);
          }
        }}
      >
        <p
          className={`text-sm font-medium leading-snug break-words transition-all duration-200 ${
            task.completed
              ? "line-through text-text-faint"
              : "text-text-primary"
          }`}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 text-xs text-text-faint line-clamp-1 break-words leading-relaxed">
            {stripMarkdown(task.description)}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <span
            className={`flex items-center gap-1.5 text-[11px] ${priority.labelText}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
            {priority.label}
          </span>
          {due && (
            <span className={`flex items-center gap-1 text-[11px] ${due.cls}`}>
              <Calendar size={10} />
              {due.label}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200 shrink-0">
        <IconButton label="Edit task" onClick={() => onEdit(task)}>
          <Pencil size={13} />
        </IconButton>
        <IconButton label="Archive task" onClick={() => onArchive(task.id)}>
          <Archive size={13} />
        </IconButton>
      </div>
    </div>
  );
}
