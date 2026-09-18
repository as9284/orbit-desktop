export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_date: string | null;
  completed: boolean;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubTask {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectColor = string;

export interface Project {
  id: string;
  name: string;
  description: string;
  color: ProjectColor;
  deadline: string | null;
  taskIds: string[];
  noteIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MeetingSessionEntry {
  id: string;
  content: string;
  createdAt: string;
}

export interface MeetingSessionArtifacts {
  createdAt: string;
  model: string | null;
  warning?: string | null;
  note: {
    title: string;
    content: string;
    noteId?: string | null;
  };
  task: {
    title: string;
    description: string;
    priority: TaskPriority;
    subTasks: string[];
    taskId?: string | null;
  };
}

export interface MeetingSession {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  entries: MeetingSessionEntry[];
  artifacts?: MeetingSessionArtifacts;
}

export interface MeetingState {
  activeSession: MeetingSession | null;
  sessions: MeetingSession[];
}

export interface LocalProfile {
  id: string;
  displayName: string;
  onboardedAt: string;
}

export interface DashboardPreferences {
  filter: string;
  sort: string;
  categoryFilter: string | null;
}

export interface LunaChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export const ORBIT_DATA_VERSION = 1;

export interface OrbitDataBundle {
  version: typeof ORBIT_DATA_VERSION;
  exportedAt: string;
  profile: LocalProfile;
  tasks: Task[];
  subTasks: SubTask[];
  notes: Note[];
  projects: Project[];
  meetings: MeetingState;
  categories: {
    tasks: Record<string, string>;
    notes: Record<string, string>;
  };
  lunaChat: unknown[];
  preferences: {
    dashboard: DashboardPreferences;
    ai: unknown;
  };
}
