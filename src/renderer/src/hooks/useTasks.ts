import { useState, useCallback, useEffect, useRef } from "react";
import { isFeatureReady, getActiveApiKey } from "../lib/ai";
import { categorizeTask, categorizeTasks } from "../lib/ai-client";
import { runBackgroundAiSession } from "../lib/background-ai-worker";
import { usesStableCategoryTaxonomy } from "../lib/category-taxonomy";
import type { Task, SubTask } from "../types/orbit";
import {
  getTasksByArchived,
  putTask,
  deleteTask as dbDeleteTask,
  deleteSubTasksByTaskId,
  getSubTasksByTaskId,
  getSubTaskCount,
  putSubTask,
  deleteSubTask,
  getTaskCategories,
  setTaskCategories,
} from "../lib/storage/db";

export interface CreateTaskData {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  due_date?: string | null;
}

export interface SubTaskInput {
  id?: string;
  title: string;
  completed?: boolean;
}

export function useTasks() {
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [loadingActive, setLoadingActive] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  const [categories, setCategories] = useState<Record<string, string>>({});
  const [isCategorizingBackground, setIsCategorizingBackground] =
    useState(false);
  const categorizeSessionsRef = useRef(0);

  const loadCategories = useCallback(async () => {
    const cats = await getTaskCategories();
    setCategories(cats);
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const writeStoredCategories = useCallback(
    async (next: Record<string, string>) => {
      await setTaskCategories(next);
      setCategories({ ...next });
    },
    [],
  );

  const readStoredCategories = useCallback(async (): Promise<
    Record<string, string>
  > => {
    return getTaskCategories();
  }, []);

  const getExistingCategoryPool = useCallback(
    (stored: Record<string, string>): string[] => {
      return [...new Set(Object.values(stored).filter(Boolean))].sort();
    },
    [],
  );

  const backgroundCategorize = useCallback(
    async (tasks: Task[]) => {
      if (!isFeatureReady("autoCategorize")) return;
      categorizeSessionsRef.current += 1;
      setIsCategorizingBackground(true);
      setAiStatus(null);

      await runBackgroundAiSession("tasks", async () => {
        let categorizedCount = 0;
        try {
          const stored = await readStoredCategories();
          const taskIds = new Set(tasks.map((t) => t.id));
          const pruned: Record<string, string> = {};
          for (const [id, cat] of Object.entries(stored)) {
            if (taskIds.has(id)) pruned[id] = cat;
          }
          const uncategorized = tasks.filter((t) => !pruned[t.id]);
          const existingCategories = getExistingCategoryPool(pruned);
          const rebuildTaxonomy = !usesStableCategoryTaxonomy(
            "task",
            existingCategories,
          );
          const pendingTasks = rebuildTaxonomy ? tasks : uncategorized;
          const nextCategories = rebuildTaxonomy ? {} : pruned;
          if (!rebuildTaxonomy) await writeStoredCategories(pruned);

          if (pendingTasks.length > 0) {
            const result = await categorizeTasks(
              pendingTasks.map((task) => ({
                id: task.id,
                title: task.title,
                context: task.description,
              })),
              rebuildTaxonomy ? [] : existingCategories,
            );
            for (const assignment of result.assignments) {
              nextCategories[assignment.id] = assignment.category;
            }
            categorizedCount = result.assignments.length;
            if (categorizedCount > 0 && (!rebuildTaxonomy || !result.error)) {
              await writeStoredCategories(nextCategories);
            }
            if (result.model) setAiStatus(`Luna via ${result.model}`);
            if (result.error) {
              setAiStatus(result.error);
              setError(`Luna categorization failed: ${result.error}`);
            }
          }
        } finally {
          categorizeSessionsRef.current -= 1;
          if (categorizeSessionsRef.current <= 0) {
            categorizeSessionsRef.current = 0;
            setIsCategorizingBackground(false);
          }
        }
        return categorizedCount;
      });
    },
    [readStoredCategories, writeStoredCategories, getExistingCategoryPool],
  );

  const categorizeSingleTask = useCallback(
    async ({
      taskId,
      title,
      description,
    }: {
      taskId: string;
      title: string;
      description?: string | null;
    }) => {
      const apiKey = getActiveApiKey();
      if (!apiKey) {
        return {
          category: null,
          model: null,
          error: "Missing API key  -  configure one in Settings → Luna.",
        };
      }

      const stored = await readStoredCategories();
      const existingCategories = getExistingCategoryPool(stored);
      const result = await categorizeTask(
        title,
        description,
        undefined,
        existingCategories,
        taskId,
      );
      if (result.category) {
        stored[taskId] = result.category;
        await writeStoredCategories(stored);
        if (result.model) setAiStatus(`Luna via ${result.model}`);
        return result;
      }
      if (result.error) {
        setAiStatus(result.error);
        setError(`Luna categorization failed: ${result.error}`);
      }
      return result;
    },
    [getExistingCategoryPool, readStoredCategories, writeStoredCategories],
  );

  const fetchActiveTasks = useCallback(async () => {
    setLoadingActive(true);
    setError(null);
    try {
      const data = await getTasksByArchived(false);
      const openTasks = data.filter((task) => !task.completed);
      const completedTasks = data.filter((task) => task.completed);
      setActiveTasks(openTasks);

      if (completedTasks.length > 0) {
        const archivedAt = new Date().toISOString();
        for (const task of completedTasks) {
          await putTask({
            ...task,
            archived: true,
            archived_at: archivedAt,
          });
        }
        setArchivedTasks((prev) => [
          ...completedTasks.map((task) => ({
            ...task,
            archived: true,
            archived_at: archivedAt,
          })),
          ...prev.filter(
            (task) => !completedTasks.some((c) => c.id === task.id),
          ),
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingActive(false);
    }
  }, []);

  const fetchArchivedTasks = useCallback(async () => {
    setLoadingArchived(true);
    setError(null);
    try {
      const data = await getTasksByArchived(true);
      setArchivedTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingArchived(false);
    }
  }, []);

  useEffect(() => {
    const onCategoriesCleared = () => {
      void loadCategories();
    };
    const onDataChanged = () => {
      void loadCategories();
      void fetchActiveTasks();
      void fetchArchivedTasks();
    };
    window.addEventListener("orbit:categories:cleared", onCategoriesCleared);
    window.addEventListener("orbit:data:changed", onDataChanged);
    return () => {
      window.removeEventListener("orbit:categories:cleared", onCategoriesCleared);
      window.removeEventListener("orbit:data:changed", onDataChanged);
    };
  }, [loadCategories, fetchActiveTasks, fetchArchivedTasks]);

  const createTask = async (data: CreateTaskData): Promise<string | null> => {
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: data.title.trim(),
      description: data.description?.trim() ?? null,
      priority: data.priority ?? "medium",
      due_date: data.due_date || null,
      completed: false,
      archived: false,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };
    try {
      await putTask(task);
      await fetchActiveTasks();
      return task.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const updateTask = async (
    id: string,
    updates: Partial<CreateTaskData>,
  ): Promise<boolean> => {
    try {
      const all = [...activeTasks, ...archivedTasks];
      const existing = all.find((t) => t.id === id);
      if (!existing) return false;
      await putTask({
        ...existing,
        ...(updates.title !== undefined && { title: updates.title.trim() }),
        ...(updates.description !== undefined && {
          description: updates.description?.trim() ?? null,
        }),
        ...(updates.priority !== undefined && { priority: updates.priority }),
        ...(updates.due_date !== undefined && { due_date: updates.due_date }),
        updated_at: new Date().toISOString(),
      });
      await fetchActiveTasks();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const toggleComplete = async (
    id: string,
    completed: boolean,
  ): Promise<boolean> => {
    try {
      const task = activeTasks.find((t) => t.id === id);
      if (!task) return false;
      const archivedAt = completed ? new Date().toISOString() : null;
      await putTask({
        ...task,
        completed,
        archived: completed,
        archived_at: archivedAt,
        updated_at: new Date().toISOString(),
      });

      if (completed) {
        setActiveTasks((prev) => prev.filter((t) => t.id !== id));
        setArchivedTasks((prev) => [
          { ...task, completed: true, archived: true, archived_at: archivedAt },
          ...prev.filter((t) => t.id !== id),
        ]);
      } else {
        setActiveTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, completed: false, archived: false, archived_at: null }
              : t,
          ),
        );
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const archiveTask = async (id: string): Promise<boolean> => {
    const archivedTask = activeTasks.find((t) => t.id === id);
    if (!archivedTask) return false;
    const archivedAt = new Date().toISOString();
    try {
      await putTask({
        ...archivedTask,
        archived: true,
        archived_at: archivedAt,
        updated_at: archivedAt,
      });
      setActiveTasks((prev) => prev.filter((t) => t.id !== id));
      setArchivedTasks((prev) => [
        { ...archivedTask, archived: true, archived_at: archivedAt },
        ...prev.filter((t) => t.id !== id),
      ]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const unarchiveTask = async (id: string): Promise<boolean> => {
    const restoredTask = archivedTasks.find((t) => t.id === id);
    if (!restoredTask) return false;
    try {
      await putTask({
        ...restoredTask,
        archived: false,
        archived_at: null,
        completed: false,
        updated_at: new Date().toISOString(),
      });
      setArchivedTasks((prev) => prev.filter((t) => t.id !== id));
      setActiveTasks((prev) => [
        {
          ...restoredTask,
          archived: false,
          archived_at: null,
          completed: false,
        },
        ...prev,
      ]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const deleteForever = async (id: string): Promise<boolean> => {
    try {
      await deleteSubTasksByTaskId(id);
      await dbDeleteTask(id);
      setArchivedTasks((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const fetchSubTasks = async (taskId: string): Promise<SubTask[]> => {
    try {
      return await getSubTasksByTaskId(taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    }
  };

  const fetchSubTaskCount = async (taskId: string): Promise<number> => {
    return getSubTaskCount(taskId);
  };

  const saveSubTasks = async (
    taskId: string,
    subTasks: SubTaskInput[],
    existingIds: string[],
  ): Promise<boolean> => {
    try {
      const newIds = subTasks.filter((s) => s.id).map((s) => s.id!);
      const toDelete = existingIds.filter((id) => !newIds.includes(id));

      for (const id of toDelete) {
        await deleteSubTask(id);
      }

      const now = new Date().toISOString();
      const existingSubTasks = await getSubTasksByTaskId(taskId);
      const existingById = new Map(existingSubTasks.map((s) => [s.id, s]));

      for (let i = 0; i < subTasks.length; i++) {
        const st = subTasks[i];
        if (st.id) {
          const prev = existingById.get(st.id);
          await putSubTask({
            id: st.id,
            task_id: taskId,
            title: st.title.trim(),
            completed: st.completed ?? false,
            position: i,
            created_at: prev?.created_at ?? now,
            updated_at: now,
          });
        } else {
          await putSubTask({
            id: crypto.randomUUID(),
            task_id: taskId,
            title: st.title.trim(),
            completed: st.completed ?? false,
            position: i,
            created_at: now,
            updated_at: now,
          });
        }
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const toggleSubTaskComplete = async (
    subTaskId: string,
    completed: boolean,
  ): Promise<boolean> => {
    try {
      const allTasks = [...activeTasks, ...archivedTasks];
      for (const task of allTasks) {
        const subs = await getSubTasksByTaskId(task.id);
        const sub = subs.find((s) => s.id === subTaskId);
        if (sub) {
          await putSubTask({
            ...sub,
            completed,
            updated_at: new Date().toISOString(),
          });
          return true;
        }
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const updateSubTaskTitle = async (
    subTaskId: string,
    title: string,
  ): Promise<boolean> => {
    try {
      const allTasks = [...activeTasks, ...archivedTasks];
      for (const task of allTasks) {
        const subs = await getSubTasksByTaskId(task.id);
        const sub = subs.find((s) => s.id === subTaskId);
        if (sub) {
          await putSubTask({
            ...sub,
            title: title.trim(),
            updated_at: new Date().toISOString(),
          });
          return true;
        }
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  return {
    activeTasks,
    archivedTasks,
    loadingActive,
    loadingArchived,
    error,
    fetchActiveTasks,
    fetchArchivedTasks,
    createTask,
    updateTask,
    toggleComplete,
    archiveTask,
    unarchiveTask,
    deleteForever,
    fetchSubTasks,
    fetchSubTaskCount,
    saveSubTasks,
    toggleSubTaskComplete,
    updateSubTaskTitle,
    categories,
    isCategorizingBackground,
    aiStatus,
    backgroundCategorize,
    categorizeSingleTask,
  };
}

export type TasksApi = ReturnType<typeof useTasks>;
