import { useEffect, useState, useMemo, useCallback } from "react";
import { orbitNotify as toast } from "../lib/notify";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import {
  Plus,
  CheckCircle2,
  Circle,
  AlertCircle,
  Sparkles,
  Tag,
  X,
  ListTodo,
} from "lucide-react";
import { isFeatureReady } from "../lib/ai";
import { isPast, isToday, parseISO } from "date-fns";
import { useTasksApi } from "../components/layout/AppLayout";
import { TaskCard } from "../components/tasks/TaskCard";
import { CreateTaskModal } from "../components/tasks/CreateTaskModal";
import { EditTaskModal } from "../components/tasks/EditTaskModal";
import { TaskPreviewModal } from "../components/tasks/TaskPreviewModal";
import { Spinner } from "../components/ui/Spinner";
import { Button } from "../components/ui/Button";
import { Tabs } from "../components/ui/Tabs";
import { ProgressBar } from "../components/ui/ProgressBar";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { cn } from "../lib/cn";
import { PRIORITY_ORDER } from "../lib/theme";
import type { Task } from "../types/orbit";
import type { SubTaskInput } from "../hooks/useTasks";
import {
  getDashboardPreferences,
  setDashboardPreferences,
} from "../lib/storage/db";

type Filter = "active" | "overdue";
type Sort = "recent" | "priority" | "due";

const SORT_LABELS: Record<Sort, string> = {
  recent: "Recent",
  priority: "Priority",
  due: "Due date",
};

function isOverdue(task: Task) {
  return (
    !task.completed &&
    !!task.due_date &&
    isPast(parseISO(task.due_date)) &&
    !isToday(parseISO(task.due_date))
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function sanitizeStoredFilter(value: string | null): Filter {
  return value === "overdue" ? "overdue" : "active";
}

export function DashboardPage() {
  const api = useTasksApi();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [previewTask, setPreviewTask] = useState<Task | null>(null);

  // Re-render when AI settings change so feature checks update immediately
  const [, setAiTick] = useState(0);
  useEffect(() => {
    const handler = () => setAiTick((t) => t + 1);
    window.addEventListener("orbit:ai:changed", handler);
    return () => window.removeEventListener("orbit:ai:changed", handler);
  }, []);

  const [filter, setFilter] = useState<Filter>("active");
  const [sort, setSort] = useState<Sort>("recent");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    void getDashboardPreferences().then((prefs) => {
      setFilter(sanitizeStoredFilter(prefs.filter));
      setSort(
        prefs.sort === "priority" || prefs.sort === "due"
          ? prefs.sort
          : "recent",
      );
      setCategoryFilter(prefs.categoryFilter);
      setPrefsLoaded(true);
    });
  }, []);

  useEffect(() => {
    const reload = () => {
      void getDashboardPreferences().then((prefs) => {
        setFilter(sanitizeStoredFilter(prefs.filter));
        setSort(
          prefs.sort === "priority" || prefs.sort === "due"
            ? prefs.sort
            : "recent",
        );
        setCategoryFilter(prefs.categoryFilter);
      });
    };
    window.addEventListener("orbit:data:changed", reload);
    return () => window.removeEventListener("orbit:data:changed", reload);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    void setDashboardPreferences({ filter, sort, categoryFilter });
  }, [filter, sort, categoryFilter, prefsLoaded]);

  const debouncedBackgroundCategorize = useDebouncedCallback(() => {
    if (!api.loadingActive && api.activeTasks.length > 0) {
      void api.backgroundCategorize(api.activeTasks);
    }
  }, 2500);

  useEffect(() => {
    debouncedBackgroundCategorize();
  }, [api.activeTasks, api.loadingActive, debouncedBackgroundCategorize]);

  useEffect(() => {
    if (api.aiStatus && api.aiStatus.startsWith("Luna via ")) {
      return;
    }
    if (api.aiStatus) {
      toast.error(api.aiStatus, { id: "orbit-ai-status" });
    }
  }, [api.aiStatus]);

  useEffect(() => {
    void api.fetchActiveTasks();
    void api.fetchArchivedTasks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut: N to create new task
  const openCreate = useCallback(() => setCreateOpen(true), []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !createOpen &&
        !editTask &&
        !previewTask
      ) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        openCreate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreate, createOpen, editTask, previewTask]);

  const stats = useMemo(() => {
    const openTasks = api.activeTasks.filter((t) => !t.completed);
    const completed = api.archivedTasks.filter((t) => t.completed).length;
    const total = openTasks.length + completed;
    const active = openTasks.length;
    const overdue = openTasks.filter(isOverdue).length;
    return { total, completed, active, overdue };
  }, [api.activeTasks, api.archivedTasks]);

  const progressPercent =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const displayed = useMemo(() => {
    let tasks = api.activeTasks.filter((t) => !t.completed);

    if (filter === "overdue") tasks = tasks.filter(isOverdue);

    if (categoryFilter) {
      tasks = tasks.filter((t) => api.categories[t.id] === categoryFilter);
    }

    if (sort === "priority") {
      tasks.sort(
        (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
      );
    } else if (sort === "due") {
      tasks.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    }

    return tasks;
  }, [api.activeTasks, api.categories, filter, sort, categoryFilter]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const task of api.activeTasks) {
      const cat = api.categories[task.id];
      if (cat) cats.add(cat);
    }
    return [...cats].sort();
  }, [api.activeTasks, api.categories]);

  // Clear category filter if the selected category no longer exists
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (categoryFilter && !uniqueCategories.includes(categoryFilter)) {
      setCategoryFilter(null);
    }
  }, [uniqueCategories, categoryFilter]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async (
    data: Parameters<typeof api.createTask>[0],
    subTasks: SubTaskInput[],
  ) => {
    const taskId = await api.createTask(data);
    if (taskId) {
      if (subTasks.length > 0) {
        await api.saveSubTasks(taskId, subTasks, []);
      }
      toast.success("Task created");
    } else {
      toast.error("Failed to create task");
    }
    return !!taskId;
  };

  const handleSave = async (
    id: string,
    data: Parameters<typeof api.updateTask>[1],
    subTasks: SubTaskInput[],
    existingSubTaskIds: string[],
  ) => {
    const ok = await api.updateTask(id, data);
    if (ok) {
      await api.saveSubTasks(id, subTasks, existingSubTaskIds);
      toast.success("Task updated");
    } else {
      toast.error("Failed to update task");
    }
    return ok;
  };

  const handleToggle = async (id: string, completed: boolean) => {
    const ok = await api.toggleComplete(id, completed);
    if (!ok) {
      toast.error("Failed to update task");
      return ok;
    }
    if (completed) {
      if (previewTask?.id === id) setPreviewTask(null);
      toast.success("Task completed and archived");
    }
    return ok;
  };

  const handleArchive = async (id: string) => {
    const ok = await api.archiveTask(id);
    if (ok) toast.success("Task archived");
    else toast.error("Failed to archive task");
    return ok;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10 animate-fade-in">
      {/* Page header */}
      <PageHeader
        className="mb-8 sm:mb-10"
        title={getGreeting()}
        subtitle={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        action={
          <Button
            variant="primary"
            onClick={openCreate}
            className="w-full px-5 sm:w-auto"
          >
            <Plus size={16} strokeWidth={2.5} />
            New task
            <kbd className="ml-1 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/60 sm:inline">
              N
            </kbd>
          </Button>
        }
      />

      {/* Hero stats  -  dramatic glass cards with display-font numbers */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-8 animate-fade-in"
        style={{ animationDelay: "50ms" }}
      >
        <div className="glass rounded-2xl px-4 py-3.5 flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-faint">
            <Circle size={11} className="text-blue-400/70" />
            Active
          </span>
          <span className="font-display text-3xl font-bold leading-none tabular-nums text-text-primary">
            {stats.active}
          </span>
        </div>
        <div
          className={cn(
            "glass rounded-2xl px-4 py-3.5 flex flex-col gap-1.5 transition-opacity",
            stats.overdue === 0 && "opacity-55",
          )}
        >
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-faint">
            <AlertCircle
              size={11}
              className={stats.overdue > 0 ? "text-rose-400/80" : "text-text-faint"}
            />
            Overdue
          </span>
          <span
            className={cn(
              "font-display text-3xl font-bold leading-none tabular-nums",
              stats.overdue > 0 ? "text-rose-300" : "text-text-primary",
            )}
          >
            {stats.overdue}
          </span>
        </div>
        <div className="glass rounded-2xl px-4 py-3.5 flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-faint">
            <CheckCircle2 size={11} className="text-emerald-400/70" />
            Done
          </span>
          <span className="font-display text-3xl font-bold leading-none tabular-nums text-text-primary">
            {stats.completed}
          </span>
        </div>
        <div className="glass rounded-2xl px-4 py-3.5 flex flex-col justify-center gap-2 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-text-faint">
            <span>Progress</span>
            <span className="font-display text-text-secondary tabular-nums">
              {progressPercent}%
            </span>
          </div>
          <ProgressBar value={progressPercent} />
        </div>
      </div>

      {/* Filter + sort bar */}
      <div
        className="relative z-20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-y-2 mb-4 sm:mb-5 animate-fade-in"
        style={{ animationDelay: "100ms" }}
      >
        <Tabs
          ariaLabel="Task filters"
          value={filter}
          onChange={(id) => setFilter(id as Filter)}
          tabs={[
            { id: "active", label: "Active" },
            { id: "overdue", label: "Overdue" },
          ]}
        />

        <div className="w-36">
          <Select
            compact
            ariaLabel="Sort tasks"
            value={sort}
            onChange={(value) => setSort(value as Sort)}
            options={(["recent", "priority", "due"] as Sort[]).map((value) => ({
              value,
              label: SORT_LABELS[value],
            }))}
          />
        </div>
      </div>

      {/* Category filter chips */}
      {isFeatureReady("autoCategorize") &&
        (uniqueCategories.length > 0 || api.isCategorizingBackground) && (
          <div
            className="flex items-center gap-2 flex-wrap mb-4 animate-fade-in"
            style={{ animationDelay: "120ms" }}
          >
            <span className="flex items-center gap-1 text-[10px] text-text-faint font-semibold uppercase tracking-widest shrink-0">
              <Tag size={10} />
              Category
              {api.isCategorizingBackground && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
              )}
            </span>
            {uniqueCategories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setCategoryFilter(cat === categoryFilter ? null : cat)
                }
                className={`px-2.5 py-1 min-h-9 sm:min-h-0 rounded-lg text-xs font-medium transition-all duration-200 border break-words ${
                  categoryFilter === cat
                    ? "bg-accent-muted text-accent-text border-accent/30"
                    : "bg-tint-1 text-text-muted border-border-default hover:text-text-secondary hover:bg-tint-2 hover:border-border-strong"
                }`}
              >
                {cat}
              </button>
            ))}
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter(null)}
                className="flex items-center gap-1 min-h-9 sm:min-h-0 text-[11px] text-text-faint hover:text-text-muted transition-colors"
                aria-label="Clear category filter"
              >
                <X size={10} />
                Clear
              </button>
            )}
            {!api.isCategorizingBackground &&
              isFeatureReady("autoCategorize") &&
              api.activeTasks.some((t) => !api.categories[t.id]) && (
                <button
                  onClick={() => void api.backgroundCategorize(api.activeTasks)}
                  className="ml-auto flex items-center gap-1 min-h-9 sm:min-h-0 text-[11px] text-text-faint hover:text-accent-text transition-colors"
                  title="Categorise remaining tasks"
                >
                  <Sparkles size={11} />
                  Categorise
                </button>
              )}
          </div>
        )}

      {api.aiStatus && !api.aiStatus.startsWith("Luna via ") && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3 py-2 text-xs text-amber-200/80">
          {api.aiStatus}
        </div>
      )}

      {/* Task list */}
      {api.loadingActive ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size={24} className="text-text-faint" />
        </div>
      ) : displayed.length === 0 ? (
        categoryFilter ? (
          <EmptyState
            icon={<Tag size={20} className="text-text-faint" />}
            title={`No tasks in “${categoryFilter}”`}
            action={
              <Button variant="secondary" className="px-5" onClick={openCreate}>
                <Plus size={15} />
                New task
              </Button>
            }
          />
        ) : filter === "active" ? (
          <EmptyState
            float
            icon={<Sparkles size={22} className="text-accent/40" />}
            title="No active tasks right now."
            action={
              <Button variant="secondary" className="px-5" onClick={openCreate}>
                <Plus size={15} />
                Create your first task
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<ListTodo size={22} className="text-text-faint" />}
            title="No overdue tasks  -  you're on track!"
          />
        )
      ) : (
        <div className="space-y-2">
          {displayed.map((task, i) => (
            <div
              key={task.id}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(i * 40, 400) + 120}ms` }}
            >
              <TaskCard
                task={task}
                onToggleComplete={handleToggle}
                onArchive={handleArchive}
                onEdit={setEditTask}
                onPreview={setPreviewTask}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <EditTaskModal
        task={editTask}
        onClose={() => setEditTask(null)}
        onSave={handleSave}
        fetchSubTasks={api.fetchSubTasks}
      />
      <TaskPreviewModal
        task={previewTask}
        onClose={() => setPreviewTask(null)}
        onEdit={(t) => {
          setPreviewTask(null);
          setEditTask(t);
        }}
        fetchSubTasks={api.fetchSubTasks}
        fetchSubTaskCount={api.fetchSubTaskCount}
        onToggleSubTask={api.toggleSubTaskComplete}
        onUpdateSubTask={api.updateSubTaskTitle}
      />
    </div>
  );
}
