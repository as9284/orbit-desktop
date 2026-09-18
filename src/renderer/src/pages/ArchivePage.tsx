import { useEffect, useState, useCallback } from "react";
import { orbitNotify as toast } from "../lib/notify";
import {
  ArchiveRestore,
  Trash2,
  Archive,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTasksApi } from "../components/layout/AppLayout";
import { Spinner } from "../components/ui/Spinner";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import type { Task } from "../types/orbit";

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-blue-400",
  medium: "bg-amber-400",
  high: "bg-rose-400",
};

export function ArchivePage() {
  const api = useTasksApi();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    void api.fetchArchivedTasks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnarchive = useCallback(
    async (id: string) => {
      const ok = await api.unarchiveTask(id);
      if (ok) toast.success("Task restored");
      else toast.error("Failed to restore task");
    },
    [api],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await api.deleteForever(id);
      if (ok) toast.success("Task permanently deleted");
      else toast.error("Failed to delete task");
      setConfirmDelete(null);
    },
    [api],
  );

  const handleClearAll = useCallback(async () => {
    const ids = api.archivedTasks.map((t) => t.id);
    setConfirmDelete(null);
    for (const id of ids) {
      await api.deleteForever(id);
    }
    toast.success(
      `Cleared ${ids.length} archived task${ids.length !== 1 ? "s" : ""}`,
    );
  }, [api]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3 pr-14 md:pr-0 mb-6 sm:mb-8">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
            Archive
          </h1>
          <p className="text-xs text-text-muted mt-1 tracking-wide">
            {api.archivedTasks.length} archived task
            {api.archivedTasks.length !== 1 ? "s" : ""}
          </p>
        </div>
        {api.archivedTasks.length > 0 && (
          <button
            onClick={() => setConfirmDelete("__all__")}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-danger/25 text-danger/75 hover:text-danger hover:border-danger/40 hover:bg-danger/6 rounded-xl text-xs font-semibold transition-all duration-200 focus-ring"
          >
            <Trash2 size={13} />
            Clear all
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 p-3.5 mb-6 glass rounded-xl text-xs text-text-muted">
        <Archive size={13} className="mt-0.5 shrink-0 text-accent-text/40" />
        Completed tasks move here automatically. Archived tasks stay off the
        dashboard until you restore them or delete them permanently.
      </div>

      {/* List */}
      {api.loadingArchived ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={24} className="text-text-faint" />
        </div>
      ) : api.archivedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-scale-in">
          <div className="w-12 h-12 rounded-2xl bg-tint-2 border border-border-subtle flex items-center justify-center mb-4 animate-float">
            <Archive size={20} className="text-text-faint" />
          </div>
          <p className="text-text-muted text-sm">Archive is empty</p>
          <p className="text-text-faint text-xs mt-1">
            Archived tasks will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {api.archivedTasks.map((task, i) => (
            <div
              key={task.id}
              className="animate-slide-up"
              style={{
                animationDelay: `${Math.min(i * 40, 400) + 80}ms`,
                animationFillMode: "backwards",
              }}
            >
              <ArchivedTaskRow
                task={task}
                confirmingDelete={confirmDelete === task.id}
                onUnarchive={() => handleUnarchive(task.id)}
                onRequestDelete={() => setConfirmDelete(task.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onConfirmDelete={() => handleDelete(task.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Confirm clear-all dialog */}
      <ConfirmModal
        open={confirmDelete === "__all__"}
        onClose={() => setConfirmDelete(null)}
        title="Confirm deletion"
        message={`Permanently delete all ${api.archivedTasks.length} archived tasks? This cannot be undone.`}
        confirmLabel="Delete all"
        onConfirm={handleClearAll}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ArchivedRowProps {
  task: Task;
  confirmingDelete: boolean;
  onUnarchive: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function ArchivedTaskRow({
  task,
  confirmingDelete,
  onUnarchive,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: ArchivedRowProps) {
  return (
    <div
      className="group flex flex-col sm:flex-row sm:items-start gap-3 px-4 py-3.5 rounded-xl glass glass-interactive transition-all duration-200"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* Priority dot */}
        <div className="mt-1.5 shrink-0">
          <div
            className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium text-text-secondary break-words ${
              task.completed ? "line-through text-text-faint" : ""
            }`}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 text-xs text-text-faint line-clamp-1 break-words">
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {task.archived_at && (
              <span className="flex items-center gap-1 text-[10px] text-text-faint">
                <Calendar size={9} />
                Archived {format(parseISO(task.archived_at), "MMM d")}
              </span>
            )}
            {task.completed && (
              <span className="text-[10px] text-emerald-400/55 font-medium">
                Completed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {!confirmingDelete ? (
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 self-end sm:self-auto">
          <button
            onClick={onUnarchive}
            title="Restore task"
            aria-label="Restore task"
            className="p-2 sm:p-1.5 rounded-lg text-text-faint hover:text-text-secondary hover:bg-tint-3 transition-colors focus-ring"
          >
            <ArchiveRestore size={14} />
          </button>
          <button
            onClick={onRequestDelete}
            title="Delete permanently"
            aria-label="Delete permanently"
            className="p-2 sm:p-1.5 rounded-lg text-text-faint hover:text-danger hover:bg-danger/8 transition-colors focus-ring"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0 animate-fade-in self-end sm:self-auto">
          <p className="text-[11px] text-danger/80 flex items-center gap-1">
            <AlertTriangle size={11} />
            Delete?
          </p>
          <button
            onClick={onConfirmDelete}
            className="min-h-9 px-2.5 py-1 text-[11px] font-semibold bg-danger/20 text-danger hover:bg-danger/30 rounded-lg transition-colors focus-ring"
          >
            Delete
          </button>
          <button
            onClick={onCancelDelete}
            className="min-h-9 px-2.5 py-1 text-[11px] text-text-muted hover:text-text-secondary rounded-lg transition-colors focus-ring"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
