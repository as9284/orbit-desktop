import toast from "react-hot-toast";

export type NotifySource = "luna" | "user" | "background";
export type NotifyKind = "success" | "error" | "info";

export interface NotifyEvent {
  source: NotifySource;
  kind: NotifyKind;
  action: string;
  subject?: string;
  message?: string;
  groupId?: string;
  immediate?: boolean;
}

interface BatchState {
  events: NotifyEvent[];
  timer: ReturnType<typeof setTimeout> | null;
  toastId: string;
}

const FLUSH_AFTER_IDLE_MS = 800;
const batches = new Map<string, BatchState>();

const ACTION_LABELS: Record<string, { verb: string; noun: string }> = {
  create_task: { verb: "created", noun: "task" },
  update_task: { verb: "updated", noun: "task" },
  complete_task: { verb: "completed", noun: "task" },
  archive_task: { verb: "archived", noun: "task" },
  unarchive_task: { verb: "restored", noun: "task" },
  delete_task: { verb: "deleted", noun: "task" },
  add_subtasks: { verb: "updated", noun: "task" },
  create_note: { verb: "created", noun: "note" },
  update_note: { verb: "updated", noun: "note" },
  delete_note: { verb: "deleted", noun: "note" },
  create_project: { verb: "created", noun: "project" },
  update_project: { verb: "updated", noun: "project" },
  delete_project: { verb: "deleted", noun: "project" },
  link_task_to_project: { verb: "linked", noun: "task" },
  link_note_to_project: { verb: "linked", noun: "note" },
  unlink_task_from_project: { verb: "unlinked", noun: "task" },
  unlink_note_from_project: { verb: "unlinked", noun: "note" },
  start_meeting: { verb: "started", noun: "meeting" },
  end_meeting: { verb: "ended", noun: "meeting" },
  add_meeting_entry: { verb: "added", noun: "meeting entry" },
  recategorize_tasks: { verb: "regenerated", noun: "task categories" },
  recategorize_notes: { verb: "regenerated", noun: "note categories" },
  transform_text: { verb: "transformed", noun: "text" },
  categorize: { verb: "categorized", noun: "item" },
  summarize_note: { verb: "summarized", noun: "note" },
  convert_note: { verb: "converted", noun: "note" },
  suggest_subtasks: { verb: "suggested sub-tasks for", noun: "task" },
  meeting_artifacts: { verb: "finished", noun: "meeting" },
  meeting_agenda: { verb: "generated agenda for", noun: "meeting" },
  writing: { verb: "processed", noun: "text" },
  project_summary: { verb: "generated summary for", noun: "project" },
  project_color: { verb: "picked color for", noun: "project" },
  project_starter: { verb: "planned tasks for", noun: "project" },
  generic_create: { verb: "created", noun: "item" },
  generic_update: { verb: "updated", noun: "item" },
  generic_delete: { verb: "deleted", noun: "item" },
};

function isOnLunaPage(): boolean {
  return window.location.pathname === "/luna" || window.location.pathname.endsWith("/luna");
}

function formatActionCount(action: string, count: number): string {
  const meta = ACTION_LABELS[action] ?? { verb: action.replace(/_/g, " "), noun: "item" };
  const noun = count === 1 ? meta.noun : `${meta.noun}s`;
  return `${meta.verb} ${count} ${noun}`;
}

function summarizeSuccess(events: NotifyEvent[]): string {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "success") continue;
    counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([action, count]) =>
    formatActionCount(action, count),
  );
  if (parts.length === 0) return "Actions completed";
  const prefix =
    events[0]?.source === "luna"
      ? "Luna"
      : events[0]?.source === "background"
        ? "Luna"
        : "";
  return prefix ? `${prefix}: ${parts.join(", ")}` : parts.join(", ");
}

function formatSingle(event: NotifyEvent): string {
  if (event.message) return event.message;
  const meta = ACTION_LABELS[event.action];
  if (!meta) return event.subject ?? "Done";
  if (event.subject) {
    return `${meta.verb.charAt(0).toUpperCase() + meta.verb.slice(1)} ${meta.noun}: ${event.subject}`;
  }
  return `${meta.verb.charAt(0).toUpperCase() + meta.verb.slice(1)} ${meta.noun}`;
}

function flushBatch(groupId: string): void {
  const batch = batches.get(groupId);
  if (!batch || batch.events.length === 0) return;

  const errors = batch.events.filter((e) => e.kind === "error");
  const successes = batch.events.filter((e) => e.kind === "success");
  const infos = batch.events.filter((e) => e.kind === "info");

  if (successes.length === 1 && errors.length === 0 && infos.length === 0) {
    toast.success(formatSingle(successes[0]), { id: batch.toastId });
  } else if (successes.length > 1 && errors.length === 0) {
    toast.success(summarizeSuccess(successes), { id: batch.toastId });
  } else if (infos.length > 0 && successes.length === 0 && errors.length === 0) {
    toast(infos.map((e) => e.message ?? formatSingle(e)).join(", "), {
      id: batch.toastId,
    });
  }

  for (const error of errors) {
    toast.error(error.message ?? formatSingle(error), {
      id: `${batch.toastId}-err-${error.action}`,
    });
  }

  batches.delete(groupId);
}

function scheduleFlush(groupId: string): void {
  const batch = batches.get(groupId);
  if (!batch) return;
  if (batch.timer) clearTimeout(batch.timer);
  batch.timer = setTimeout(() => flushBatch(groupId), FLUSH_AFTER_IDLE_MS);
}

function getOrCreateBatch(groupId: string): BatchState {
  let batch = batches.get(groupId);
  if (!batch) {
    batch = {
      events: [],
      timer: null,
      toastId: `orbit-batch-${groupId}`,
    };
    batches.set(groupId, batch);
  }
  return batch;
}

export function notify(event: NotifyEvent): void {
  if (
    event.source === "luna" &&
    event.kind === "success" &&
    isOnLunaPage() &&
    !event.immediate
  ) {
    return;
  }

  if (event.kind === "error" || event.immediate || !event.groupId) {
    const text = event.message ?? formatSingle(event);
    if (event.kind === "error") toast.error(text);
    else if (event.kind === "info") toast(text);
    else toast.success(text);
    return;
  }

  const batch = getOrCreateBatch(event.groupId);
  batch.events.push(event);
  scheduleFlush(event.groupId);
}

export function flushNotifyGroup(groupId: string | null | undefined): void {
  if (!groupId) return;
  const batch = batches.get(groupId);
  if (batch?.timer) clearTimeout(batch.timer);
  flushBatch(groupId);
}

export function notifyBackgroundCategorizeComplete(
  taskCount: number,
  noteCount: number,
): void {
  const parts: string[] = [];
  if (taskCount > 0) {
    parts.push(`${taskCount} task${taskCount === 1 ? "" : "s"}`);
  }
  if (noteCount > 0) {
    parts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return;

  notify({
    source: "background",
    kind: "info",
    action: "categorize",
    message: `Luna categorized ${parts.join(" and ")}`,
    immediate: true,
  });
}

/** Drop-in replacements for react-hot-toast direct usage */
export const orbitNotify = {
  success: (message: string, opts?: { id?: string }) =>
    toast.success(message, opts),
  error: (message: string, opts?: { id?: string }) => toast.error(message, opts),
  info: (message: string, opts?: { id?: string }) => toast(message, opts),
};
