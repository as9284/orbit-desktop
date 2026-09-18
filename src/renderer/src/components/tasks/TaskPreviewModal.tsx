import { useRef, useState, useEffect } from "react";
import { format, isPast, isToday, isTomorrow, parseISO } from "date-fns";
import {
  Calendar,
  Flag,
  AlignLeft,
  Circle,
  CheckCircle2,
  Pencil,
  ListChecks,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { SectionLabel } from "../ui/SectionLabel";
import { ProgressBar } from "../ui/ProgressBar";
import { renderMarkdown } from "../../lib/markdown";
import type { Task, SubTask } from "../../types/orbit";

interface Props {
  task: Task | null;
  onClose: () => void;
  onEdit: (task: Task) => void;
  fetchSubTasks: (taskId: string) => Promise<SubTask[]>;
  fetchSubTaskCount: (taskId: string) => Promise<number>;
  onToggleSubTask: (subTaskId: string, completed: boolean) => Promise<boolean>;
  onUpdateSubTask: (subTaskId: string, title: string) => Promise<boolean>;
}

const PRIORITY_CONFIG = {
  low: {
    label: "Low",
    dot: "bg-blue-400/70",
    text: "text-blue-400",
    bg: "bg-blue-500/[0.08] border-blue-500/20",
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-400/80",
    text: "text-amber-400",
    bg: "bg-amber-500/[0.08] border-amber-500/20",
  },
  high: {
    label: "High",
    dot: "bg-rose-400",
    text: "text-rose-400",
    bg: "bg-rose-500/[0.08] border-rose-500/20",
  },
};

function getDueDateInfo(due: string, completed: boolean) {
  const d = parseISO(due);
  const formatted = format(d, "EEEE, MMMM d, yyyy");
  if (completed) return { label: formatted, cls: "text-text-muted" };
  if (isToday(d))
    return { label: `Today  -  ${formatted}`, cls: "text-amber-400" };
  if (isTomorrow(d))
    return { label: `Tomorrow  -  ${formatted}`, cls: "text-amber-300/75" };
  if (isPast(d))
    return { label: `Overdue  -  ${formatted}`, cls: "text-danger" };
  return { label: formatted, cls: "text-text-secondary" };
}

export function TaskPreviewModal({
  task,
  onClose,
  onEdit,
  fetchSubTasks,
  fetchSubTaskCount,
  onToggleSubTask,
  onUpdateSubTask,
}: Props) {
  // Keep a snapshot of the last non-null task so content stays visible
  // during the Modal's exit animation (when task becomes null).
  // React-approved pattern: setState during render to derive state from props.
  const [frozenTask, setFrozenTask] = useState<Task | null>(null);
  if (task && task !== frozenTask) {
    setFrozenTask(task);
  }
  const t = task ?? frozenTask;

  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [subTaskCount, setSubTaskCount] = useState(0);
  const [subTasksLoading, setSubTasksLoading] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const completingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editCancelledRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    let fetchTimer: ReturnType<typeof setTimeout> | null = null;

    if (task) {
      // Set loading state synchronously so React commits the skeleton render
      // before we fire the fetches. Without setTimeout(0), React 18's automatic
      // batching collapses setSubTasksLoading(true) with the cache-resolved
      // .then() callbacks into a single render, bypassing the skeleton entirely.
      setSubTasksLoading(true);
      setSubTasks([]);
      setSubTaskCount(0);
      setCompletingIds(new Set());
      setEditingSubTaskId(null);
      setEditingTitle("");
      editCancelledRef.current = true;

      fetchTimer = setTimeout(() => {
        if (cancelled) return;
        fetchSubTaskCount(task.id).then((count) => {
          if (!cancelled) setSubTaskCount(count);
        });
        fetchSubTasks(task.id).then((data) => {
          if (cancelled) return;
          setSubTasks(data);
          setSubTaskCount(data.length);
          setSubTasksLoading(false);
        });
      }, 0);
    } else {
      setSubTasks([]);
      setSubTaskCount(0);
      setSubTasksLoading(false);
      setEditingSubTaskId(null);
      setEditingTitle("");
    }

    return () => {
      cancelled = true;
      if (fetchTimer !== null) clearTimeout(fetchTimer);
    };
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = completingTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleToggleSub = async (st: SubTask) => {
    const willComplete = !st.completed;
    if (willComplete) {
      setCompletingIds((prev) => new Set(prev).add(st.id));
      const existing = completingTimers.current.get(st.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setCompletingIds((prev) => {
          const next = new Set(prev);
          next.delete(st.id);
          return next;
        });
        completingTimers.current.delete(st.id);
      }, 700);
      completingTimers.current.set(st.id, timer);
    }
    const ok = await onToggleSubTask(st.id, willComplete);
    if (ok) {
      setSubTasks((prev) =>
        prev.map((s) =>
          s.id === st.id ? { ...s, completed: willComplete } : s,
        ),
      );
    } else if (willComplete) {
      // Revert animation if API failed
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(st.id);
        return next;
      });
    }
  };

  const startEditing = (st: SubTask) => {
    editCancelledRef.current = false;
    setEditingSubTaskId(st.id);
    setEditingTitle(st.title);
  };

  const cancelEditing = () => {
    editCancelledRef.current = true;
    setEditingSubTaskId(null);
    setEditingTitle("");
  };

  const commitEdit = async () => {
    if (editCancelledRef.current) {
      editCancelledRef.current = false;
      return;
    }
    const id = editingSubTaskId;
    const trimmed = editingTitle.trim();
    setEditingSubTaskId(null);
    setEditingTitle("");
    if (!id || !trimmed) return;
    const original = subTasks.find((s) => s.id === id);
    if (original?.title === trimmed) return;
    const ok = await onUpdateSubTask(id, trimmed);
    if (ok) {
      setSubTasks((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s)),
      );
    }
  };

  const priority = t ? PRIORITY_CONFIG[t.priority] : null;
  const due = t?.due_date ? getDueDateInfo(t.due_date, t.completed) : null;
  // While loading, use the known count (from the quick count fetch) or fall back
  // to 3 placeholder rows so skeletons always appear immediately.
  const skeletonCount = subTasksLoading
    ? subTaskCount > 0
      ? subTaskCount
      : 3
    : subTaskCount;
  const skeletonWidths = Array.from({ length: skeletonCount }, (_, index) => {
    const widths = [58, 78, 44, 67, 52, 73];
    return widths[index % widths.length];
  });
  const subTaskPercent =
    subTasks.length > 0
      ? Math.round(
          (subTasks.filter((s) => s.completed).length / subTasks.length) * 100,
        )
      : 0;

  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title="Task details"
      maxWidth="max-w-xl"
    >
      {t && priority && (
        <div className="space-y-5">
          {/* Title + status */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {t.completed ? (
                <CheckCircle2 size={20} className="text-emerald-400/60" />
              ) : (
                <Circle size={20} className="text-text-faint" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={`text-lg font-semibold leading-snug break-words ${
                  t.completed
                    ? "line-through text-text-faint"
                    : "text-text-primary"
                }`}
              >
                {t.title}
              </h3>
              <span
                className={`inline-block mt-1.5 text-[11px] font-medium ${
                  t.completed ? "text-emerald-400/60" : "text-text-faint"
                }`}
              >
                {t.completed ? "Completed" : "Active"}
              </span>
            </div>
          </div>

          {/* Description */}
          {t.description && (
            <div>
              <SectionLabel icon={<AlignLeft size={12} />} className="mb-2">
                Description
              </SectionLabel>
              <div className="glass rounded-xl px-4 py-3 text-sm text-text-secondary leading-relaxed space-y-1.5">
                {renderMarkdown(t.description)}
              </div>
            </div>
          )}

          {/* Sub-tasks */}
          {(subTasksLoading || subTasks.length > 0) && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <SectionLabel icon={<ListChecks size={12} />}>
                  Sub-tasks
                </SectionLabel>
                {!subTasksLoading && (
                  <span className="text-[10px] text-text-faint ml-auto">
                    {subTasks.filter((s) => s.completed).length}/
                    {subTasks.length}
                  </span>
                )}
              </div>
              {/* Sub-task progress bar */}
              {subTasksLoading ? (
                <div className="h-1.5 bg-tint-2 rounded-full overflow-hidden mb-3">
                  <div className="h-full w-2/5 bg-tint-3 rounded-full animate-pulse" />
                </div>
              ) : (
                <ProgressBar value={subTaskPercent} className="h-1.5 mb-3" />
              )}
              {subTasksLoading ? (
                <div className="space-y-1">
                  {skeletonWidths.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 px-3 py-2"
                    >
                      <div className="w-3.75 h-3.75 rounded-full bg-tint-3 animate-pulse shrink-0" />
                      <div
                        className="h-2.5 rounded-full bg-tint-3 animate-pulse"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {subTasks.map((st) => {
                    const isCompleting = completingIds.has(st.id);
                    const isEditing = editingSubTaskId === st.id;
                    return isEditing ? (
                      <div
                        key={st.id}
                        className="flex items-center gap-2.5 px-3 py-2"
                      >
                        <span className="shrink-0 text-text-faint">
                          {st.completed ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <Circle size={15} />
                          )}
                        </span>
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitEdit();
                            }
                            if (e.key === "Escape") cancelEditing();
                          }}
                          onBlur={() => void commitEdit()}
                          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary border-b border-border-strong focus:border-accent/60 focus:outline-none transition-colors"
                        />
                      </div>
                    ) : (
                      <div
                        key={st.id}
                        className={[
                          "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 group/sub",
                          isCompleting ? "animate-row-complete" : "",
                          st.completed
                            ? "hover:bg-tint-1"
                            : "hover:bg-emerald-500/5",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleSub(st)}
                          role="checkbox"
                          aria-checked={st.completed}
                          aria-label={
                            st.completed
                              ? `Mark "${st.title}" as incomplete`
                              : `Mark "${st.title}" as complete`
                          }
                          className="flex items-start gap-2.5 flex-1 min-w-0 text-left"
                        >
                          <span
                            className={[
                              "shrink-0 transition-all duration-150",
                              isCompleting ? "animate-check-pop" : "",
                              st.completed
                                ? "text-emerald-400/60"
                                : "text-text-faint group-hover/sub:text-emerald-400/55",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {st.completed ? (
                              <CheckCircle2 size={15} />
                            ) : (
                              <Circle size={15} />
                            )}
                          </span>
                          <span
                            className={`text-sm flex-1 min-w-0 break-words transition-colors duration-200 ${
                              st.completed
                                ? "line-through text-text-faint"
                                : "text-text-secondary group-hover/sub:text-text-primary"
                            }`}
                          >
                            {st.title}
                          </span>
                        </button>
                        <span
                          className={`text-[10px] font-medium shrink-0 opacity-0 group-hover/sub:opacity-100 transition-all duration-150 ${
                            st.completed
                              ? "text-text-faint"
                              : "text-emerald-400/60"
                          }`}
                          aria-hidden="true"
                        >
                          {st.completed ? "Undo" : "Complete"}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditing(st)}
                          aria-label={`Edit "${st.title}"`}
                          className="shrink-0 opacity-0 group-hover/sub:opacity-100 p-0.5 text-text-faint hover:text-text-secondary transition-all duration-150"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Priority */}
          <div>
            <SectionLabel icon={<Flag size={12} />} className="mb-2">
              Priority
            </SectionLabel>
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold border rounded-xl ${priority.bg} ${priority.text}`}
            >
              <span className={`w-2 h-2 rounded-full ${priority.dot}`} />
              {priority.label}
            </span>
          </div>

          {/* Due date */}
          {due && (
            <div>
              <SectionLabel icon={<Calendar size={12} />} className="mb-2">
                Due date
              </SectionLabel>
              <span className={`text-sm font-medium ${due.cls}`}>
                {due.label}
              </span>
            </div>
          )}

          {/* Timestamps */}
          <div className="pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 text-[11px] text-text-faint">
            <span>
              Created{" "}
              {format(parseISO(t.created_at), "MMM d, yyyy 'at' h:mm a")}
            </span>
            <span>
              Updated{" "}
              {format(parseISO(t.updated_at), "MMM d, yyyy 'at' h:mm a")}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              onClick={() => {
                onClose();
                onEdit(t);
              }}
            >
              <Pencil size={13} />
              Edit task
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
