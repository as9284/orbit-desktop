import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Task,
  SubTask,
  Note,
  Project,
  MeetingState,
  DashboardPreferences,
  LunaChatSession,
} from "../../types/orbit";

interface MetaRow {
  key: string;
  value: unknown;
}

interface OrbitDB extends DBSchema {
  tasks: { key: string; value: Task };
  subTasks: { key: string; value: SubTask; indexes: { "by-task": string } };
  notes: { key: string; value: Note };
  projects: { key: string; value: Project };
  meta: { key: string; value: MetaRow };
  lunaSessions: { key: string; value: LunaChatSession };
}

const DB_NAME = "orbit";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<OrbitDB>> | null = null;

function getDb(): Promise<IDBPDatabase<OrbitDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OrbitDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore("tasks", { keyPath: "id" });

          const subTasks = db.createObjectStore("subTasks", { keyPath: "id" });
          subTasks.createIndex("by-task", "task_id");

          db.createObjectStore("notes", { keyPath: "id" });
          db.createObjectStore("projects", { keyPath: "id" });
          db.createObjectStore("meta", { keyPath: "key" });
        }

        if (oldVersion < 2) {
          // Luna chats move from one flat `luna-chat` meta row to a store of
          // sessions, so a write touches one chat instead of rewriting all of
          // them. The single pre-session conversation is dropped deliberately.
          db.createObjectStore("lunaSessions", { keyPath: "id" });
          if (db.objectStoreNames.contains("meta")) {
            void tx.objectStore("meta").delete("luna-chat");
          }
        }
      },
    });
  }
  return dbPromise;
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function getAllTasks(): Promise<Task[]> {
  const db = await getDb();
  return db.getAll("tasks");
}

export async function getTasksByArchived(archived: boolean): Promise<Task[]> {
  const all = await getAllTasks();
  const filtered = all.filter((t) => t.archived === archived);
  if (archived) {
    return filtered.sort((a, b) =>
      (b.archived_at ?? "").localeCompare(a.archived_at ?? ""),
    );
  }
  return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function putTask(task: Task): Promise<void> {
  const db = await getDb();
  await db.put("tasks", task);
}

export async function putTasks(tasks: Task[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("tasks", "readwrite");
  await Promise.all([...tasks.map((t) => tx.store.put(t)), tx.done]);
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("tasks", id);
}

// ── Sub-tasks ────────────────────────────────────────────────────────────────

export async function getSubTasksByTaskId(taskId: string): Promise<SubTask[]> {
  const db = await getDb();
  const items = await db.getAllFromIndex("subTasks", "by-task", taskId);
  return items.sort((a, b) => a.position - b.position);
}

export async function getSubTaskCount(taskId: string): Promise<number> {
  const items = await getSubTasksByTaskId(taskId);
  return items.length;
}

export async function putSubTask(subTask: SubTask): Promise<void> {
  const db = await getDb();
  await db.put("subTasks", subTask);
}

export async function putSubTasks(subTasks: SubTask[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("subTasks", "readwrite");
  await Promise.all([...subTasks.map((s) => tx.store.put(s)), tx.done]);
}

export async function deleteSubTask(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("subTasks", id);
}

export async function deleteSubTasksByTaskId(taskId: string): Promise<void> {
  const db = await getDb();
  const items = await getSubTasksByTaskId(taskId);
  const tx = db.transaction("subTasks", "readwrite");
  await Promise.all([...items.map((s) => tx.store.delete(s.id)), tx.done]);
}

export async function getAllSubTasks(): Promise<SubTask[]> {
  const db = await getDb();
  return db.getAll("subTasks");
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function getAllNotes(): Promise<Note[]> {
  const db = await getDb();
  const notes = await db.getAll("notes");
  return notes.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function putNote(note: Note): Promise<void> {
  const db = await getDb();
  await db.put("notes", note);
}

export async function putNotes(notes: Note[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("notes", "readwrite");
  await Promise.all([...notes.map((n) => tx.store.put(n)), tx.done]);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("notes", id);
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDb();
  const projects = await db.getAll("projects");
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putProject(project: Project): Promise<void> {
  const db = await getDb();
  await db.put("projects", project);
}

export async function putProjects(projects: Project[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("projects", "readwrite");
  await Promise.all([...projects.map((p) => tx.store.put(p)), tx.done]);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("projects", id);
}

// ── Meta (categories, meetings, luna chat, preferences) ─────────────────────

async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.get("meta", key);
  if (!row) return fallback;
  return row.value as T;
}

async function setMeta<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put("meta", { key, value } satisfies MetaRow);
}

export async function getTaskCategories(): Promise<Record<string, string>> {
  return getMeta("task-categories", {});
}

export async function setTaskCategories(
  categories: Record<string, string>,
): Promise<void> {
  await setMeta("task-categories", categories);
}

export async function getNoteCategories(): Promise<Record<string, string>> {
  return getMeta("note-categories", {});
}

export async function setNoteCategories(
  categories: Record<string, string>,
): Promise<void> {
  await setMeta("note-categories", categories);
}

export async function getMeetingState(): Promise<MeetingState> {
  return getMeta("meetings", { activeSession: null, sessions: [] });
}

export async function setMeetingState(state: MeetingState): Promise<void> {
  await setMeta("meetings", state);
}

// ── Luna chat sessions ──────────────────────────────────────────────────────

/** Newest first, by last activity. */
export async function getLunaSessions(): Promise<LunaChatSession[]> {
  const db = await getDb();
  const sessions = await db.getAll("lunaSessions");
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putLunaSession(session: LunaChatSession): Promise<void> {
  const db = await getDb();
  await db.put("lunaSessions", session);
}

export async function deleteLunaSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("lunaSessions", id);
}

export async function getDashboardPreferences(): Promise<DashboardPreferences> {
  return getMeta("dashboard-prefs", {
    filter: "active",
    sort: "recent",
    categoryFilter: null,
  });
}

export async function setDashboardPreferences(
  prefs: DashboardPreferences,
): Promise<void> {
  await setMeta("dashboard-prefs", prefs);
}

// ── Clear all ────────────────────────────────────────────────────────────────

export async function clearAllStores(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ["tasks", "subTasks", "notes", "projects", "meta", "lunaSessions"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("tasks").clear(),
    tx.objectStore("subTasks").clear(),
    tx.objectStore("notes").clear(),
    tx.objectStore("projects").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("lunaSessions").clear(),
    tx.done,
  ]);
}
