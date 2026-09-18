import { useState, useCallback, useEffect } from "react";
import type { Project, ProjectColor } from "../types/orbit";
import {
  getAllProjects,
  putProject,
  deleteProject as dbDeleteProject,
} from "../lib/storage/db";

export interface CreateProjectData {
  name: string;
  description?: string;
  color?: ProjectColor;
  deadline?: string | null;
  taskIds?: string[];
  noteIds?: string[];
}

async function readProjects(): Promise<Project[]> {
  return getAllProjects();
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = useCallback(async () => {
    const data = await readProjects();
    setProjects(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readProjects().then((data) => {
      if (!cancelled) setProjects(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      void refresh();
    };
    window.addEventListener("orbit:data:changed", handler);
    return () => window.removeEventListener("orbit:data:changed", handler);
  }, [refresh]);

  const createProject = useCallback(
    async (data: CreateProjectData): Promise<Project> => {
      const now = new Date().toISOString();
      const project: Project = {
        id: crypto.randomUUID(),
        name: data.name.trim(),
        description: data.description?.trim() ?? "",
        color: data.color ?? "violet",
        deadline: data.deadline ?? null,
        taskIds: data.taskIds ?? [],
        noteIds: data.noteIds ?? [],
        createdAt: now,
        updatedAt: now,
      };
      await putProject(project);
      await refresh();
      return project;
    },
    [refresh],
  );

  const updateProject = useCallback(
    async (id: string, updates: Partial<CreateProjectData>): Promise<boolean> => {
      const existing = (await readProjects()).find((p) => p.id === id);
      if (!existing) return false;
      const updated: Project = {
        ...existing,
        ...(updates.name !== undefined && { name: updates.name.trim() }),
        ...(updates.description !== undefined && {
          description: updates.description.trim(),
        }),
        ...(updates.color !== undefined && { color: updates.color }),
        ...(updates.deadline !== undefined && { deadline: updates.deadline }),
        ...(updates.taskIds !== undefined && { taskIds: updates.taskIds }),
        ...(updates.noteIds !== undefined && { noteIds: updates.noteIds }),
        updatedAt: new Date().toISOString(),
      };
      await putProject(updated);
      await refresh();
      return true;
    },
    [refresh],
  );

  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      const existing = await readProjects();
      if (!existing.find((p) => p.id === id)) return false;
      await dbDeleteProject(id);
      await refresh();
      return true;
    },
    [refresh],
  );

  const linkTask = useCallback(
    async (projectId: string, taskId: string): Promise<void> => {
      const existing = (await readProjects()).find((p) => p.id === projectId);
      if (!existing || existing.taskIds.includes(taskId)) return;
      await putProject({
        ...existing,
        taskIds: [...existing.taskIds, taskId],
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    },
    [refresh],
  );

  const unlinkTask = useCallback(
    async (projectId: string, taskId: string): Promise<void> => {
      const existing = (await readProjects()).find((p) => p.id === projectId);
      if (!existing) return;
      await putProject({
        ...existing,
        taskIds: existing.taskIds.filter((id) => id !== taskId),
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    },
    [refresh],
  );

  const linkNote = useCallback(
    async (projectId: string, noteId: string): Promise<void> => {
      const existing = (await readProjects()).find((p) => p.id === projectId);
      if (!existing || existing.noteIds.includes(noteId)) return;
      await putProject({
        ...existing,
        noteIds: [...existing.noteIds, noteId],
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    },
    [refresh],
  );

  const unlinkNote = useCallback(
    async (projectId: string, noteId: string): Promise<void> => {
      const existing = (await readProjects()).find((p) => p.id === projectId);
      if (!existing) return;
      await putProject({
        ...existing,
        noteIds: existing.noteIds.filter((id) => id !== noteId),
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    },
    [refresh],
  );

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
    linkTask,
    unlinkTask,
    linkNote,
    unlinkNote,
  };
}

export type ProjectsApi = ReturnType<typeof useProjects>;
