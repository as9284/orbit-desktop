import {
  ORBIT_DATA_VERSION,
  type OrbitDataBundle,
  type Task,
  type SubTask,
  type Note,
  type Project,
} from "../../types/orbit";
import { getProfile, saveProfile } from "./profile";
import { clearOrbitBrowserStorage } from "./clear";
import { getAiSettings } from "../ai";
import {
  getAllTasks,
  getAllSubTasks,
  getAllNotes,
  getAllProjects,
  getMeetingState,
  getTaskCategories,
  getNoteCategories,
  getLunaChat,
  getDashboardPreferences,
  putTasks,
  putSubTasks,
  putNotes,
  putProjects,
  setMeetingState,
  setTaskCategories,
  setNoteCategories,
  setLunaChat,
  setDashboardPreferences,
  clearAllStores,
} from "./db";

export interface ImportResult {
  tasks: number;
  subTasks: number;
  notes: number;
  projects: number;
  meetings: number;
}

export async function exportAllData(): Promise<OrbitDataBundle> {
  const profile = getProfile();
  if (!profile) {
    throw new Error("No profile found  -  complete onboarding first.");
  }

  const [tasks, subTasks, notes, projects, meetings] = await Promise.all([
    getAllTasks(),
    getAllSubTasks(),
    getAllNotes(),
    getAllProjects(),
    getMeetingState(),
  ]);

  const [taskCategories, noteCategories, lunaChat, dashboardPrefs] =
    await Promise.all([
      getTaskCategories(),
      getNoteCategories(),
      getLunaChat(),
      getDashboardPreferences(),
    ]);

  return {
    version: ORBIT_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    tasks,
    subTasks,
    notes,
    projects,
    meetings,
    categories: { tasks: taskCategories, notes: noteCategories },
    lunaChat,
    preferences: {
      dashboard: dashboardPrefs,
      ai: getAiSettings(),
    },
  };
}

export function downloadBackup(bundle: OrbitDataBundle): void {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orbit-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function isValidBundle(data: unknown): data is OrbitDataBundle {
  if (!data || typeof data !== "object") return false;
  const b = data as Partial<OrbitDataBundle>;
  return (
    b.version === ORBIT_DATA_VERSION &&
    typeof b.exportedAt === "string" &&
    b.profile !== undefined &&
    Array.isArray(b.tasks) &&
    Array.isArray(b.subTasks) &&
    Array.isArray(b.notes) &&
    Array.isArray(b.projects) &&
    b.meetings !== undefined
  );
}

function mergeById<T extends { id: string; updated_at?: string; updatedAt?: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const prevTime = prev.updated_at ?? prev.updatedAt ?? "";
    const nextTime = item.updated_at ?? item.updatedAt ?? "";
    if (nextTime >= prevTime) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

export async function importData(
  raw: unknown,
  mode: "merge" | "replace",
): Promise<ImportResult> {
  if (!isValidBundle(raw)) {
    throw new Error("Invalid backup file  -  unsupported format or version.");
  }

  const bundle = raw;

  if (mode === "replace") {
    await clearAllStores();
  }

  const [existingTasks, existingSubTasks, existingNotes, existingProjects] =
    mode === "merge"
      ? await Promise.all([
          getAllTasks(),
          getAllSubTasks(),
          getAllNotes(),
          getAllProjects(),
        ])
      : [[], [], [], []];

  const tasks =
    mode === "merge"
      ? mergeById(existingTasks as Task[], bundle.tasks)
      : bundle.tasks;
  const subTasks =
    mode === "merge"
      ? mergeById(existingSubTasks as SubTask[], bundle.subTasks)
      : bundle.subTasks;
  const notes =
    mode === "merge"
      ? mergeById(existingNotes as Note[], bundle.notes)
      : bundle.notes;
  const projects =
    mode === "merge"
      ? mergeById(existingProjects as Project[], bundle.projects)
      : bundle.projects;

  await Promise.all([
    putTasks(tasks),
    putSubTasks(subTasks),
    putNotes(notes),
    putProjects(projects),
    setMeetingState(bundle.meetings),
    setTaskCategories(bundle.categories?.tasks ?? {}),
    setNoteCategories(bundle.categories?.notes ?? {}),
    setLunaChat(bundle.lunaChat ?? []),
    bundle.preferences?.dashboard
      ? setDashboardPreferences(bundle.preferences.dashboard)
      : Promise.resolve(),
  ]);

  if (bundle.profile) {
    saveProfile(bundle.profile);
    window.dispatchEvent(new Event("orbit:profile:changed"));
  }

  if (bundle.preferences?.ai) {
    localStorage.setItem(
      "orbit:ai:settings",
      JSON.stringify(bundle.preferences.ai),
    );
    window.dispatchEvent(new Event("orbit:ai:changed"));
  }

  window.dispatchEvent(new Event("orbit:data:changed"));

  return {
    tasks: bundle.tasks.length,
    subTasks: bundle.subTasks.length,
    notes: bundle.notes.length,
    projects: bundle.projects.length,
    meetings: bundle.meetings.sessions.length,
  };
}

export async function clearAllData(): Promise<void> {
  await clearAllStores();
  clearOrbitBrowserStorage();
  window.dispatchEvent(new Event("orbit:profile:changed"));
  window.dispatchEvent(new Event("orbit:data:changed"));
}
