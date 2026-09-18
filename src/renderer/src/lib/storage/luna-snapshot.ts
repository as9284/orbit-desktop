import type { Note, Project, Task } from "../../types/orbit";
import {
  getAllNotes,
  getAllProjects,
  getTasksByArchived,
} from "./db";

export interface LunaSnapshot {
  activeTasks: Task[];
  archivedTasks: Task[];
  notes: Note[];
  projects: Project[];
}

/** Fresh read from IndexedDB for Luna tool handlers (avoids stale React state). */
export async function getLunaSnapshot(): Promise<LunaSnapshot> {
  const [activeRaw, archivedTasks, notes, projects] = await Promise.all([
    getTasksByArchived(false),
    getTasksByArchived(true),
    getAllNotes(),
    getAllProjects(),
  ]);
  return {
    activeTasks: activeRaw.filter((t) => !t.completed),
    archivedTasks,
    notes,
    projects,
  };
}

export function findProjectByName(
  projects: Project[],
  name: string,
): Project | undefined {
  const lower = name.toLowerCase();
  return (
    projects.find((p) => p.name.toLowerCase() === lower) ??
    projects.find((p) => p.name.toLowerCase().includes(lower))
  );
}

export function findTaskByTitle(
  tasks: Task[],
  title: string,
): Task | undefined {
  const lower = title.toLowerCase();
  return (
    tasks.find((t) => t.title.toLowerCase() === lower) ??
    tasks.find((t) => t.title.toLowerCase().includes(lower))
  );
}

export function findNoteByTitle(
  notes: Note[],
  title: string,
): Note | undefined {
  const lower = title.toLowerCase();
  return (
    notes.find((n) => n.title.toLowerCase() === lower) ??
    notes.find((n) => n.title.toLowerCase().includes(lower))
  );
}
