import type { NotifyEvent } from "./notify";

export interface ToolResult {
  tool: string;
  status: "pending" | "success" | "error";
  label: string;
  subject?: string;
}

export function summarizeToolResults(results: ToolResult[]): string {
  const pending = results.filter((r) => r.status === "pending").length;
  const success = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  if (pending > 0) {
    return `Working… (${pending} remaining)`;
  }
  if (failed > 0) {
    return `Completed ${success} action${success === 1 ? "" : "s"}, ${failed} failed`;
  }
  return `Completed ${success} action${success === 1 ? "" : "s"}`;
}

export function buildLunaNotifyEvent(
  action: string,
  subject: string | undefined,
  ok: boolean,
  groupId: string | null,
): NotifyEvent {
  return {
    source: "luna",
    kind: ok ? "success" : "error",
    action,
    subject,
    groupId: groupId ?? undefined,
    immediate: !ok,
  };
}
