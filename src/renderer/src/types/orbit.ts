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

/** Mirrors `ToolResult` in lib/luna-tool-batch, which is the runtime source. */
export interface LunaToolResult {
  tool: string;
  status: "pending" | "success" | "error";
  label: string;
  subject?: string;
}

/** Mirrors `CacheInfo` in lib/ai-client. */
export interface LunaCacheInfo {
  cacheHitTokens: number;
  cacheMissTokens: number;
}

/** One rendered turn in a chat session. Persisted, so keep it serializable. */
export interface LunaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  thinkingFallback?: boolean;
  /** True only while a turn is streaming into this message. Never persisted as true. */
  pending?: boolean;
  /** Set when a turn was cut short by an app restart rather than finishing. */
  interrupted?: boolean;
  toolResults?: LunaToolResult[];
  cacheInfo?: LunaCacheInfo;
}

export interface LunaChatSession {
  id: string;
  title: string;
  /** False until the title has been generated from the conversation. */
  titleGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  messages: LunaMessage[];
  /**
   * The assistant message a turn is currently streaming into. Cleared when the
   * turn settles, so a value still here at load time means the app closed
   * mid-turn and that message is incomplete.
   */
  activeTurnMessageId?: string | null;
}

export const ORBIT_DATA_VERSION = 2;

/** Bundle versions this build can still import. */
export const ORBIT_DATA_SUPPORTED_VERSIONS = [1, 2] as const;

export interface OrbitDataBundle {
  version: number;
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
  /** Absent in version 1 bundles, which carried a single flat `lunaChat`. */
  lunaSessions?: LunaChatSession[];
  preferences: {
    dashboard: DashboardPreferences;
    ai: unknown;
  };
}
