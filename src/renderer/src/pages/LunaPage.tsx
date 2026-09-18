import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { notify, flushNotifyGroup } from "../lib/notify";
import {
  buildLunaNotifyEvent,
  summarizeToolResults,
  type ToolResult,
} from "../lib/luna-tool-batch";
import {
  Send,
  Trash2,
  Square,
  LoaderCircle,
  User as UserIcon,
  CheckCircle2,
  StickyNote,
  Sparkles,
  ChevronDown,
  Archive,
  ArchiveRestore,
  PenLine,
  Video,
  RefreshCw,
  FolderOpen,
  Unlink,
  ListChecks,
} from "lucide-react";
import { useTasksApi, useNotesApi } from "../components/layout/AppLayout";
import { useApp } from "../contexts/AppContext";
import {
  getLunaChat,
  setLunaChat,
  setTaskCategories,
  setNoteCategories,
} from "../lib/storage/db";
import { getLunaSnapshot } from "../lib/storage/luna-snapshot";
import { useMeetingSessions } from "../hooks/useMeetingSessions";
import { useProjects } from "../hooks/useProjects";

import {
  hasApiKey,
  isFeatureReady,
  activeModelSupportsThinking,
} from "../lib/ai";
import {
  buildLunaSystemPrompt,
  streamLunaChat,
  processWriting,
  type ChatMessage,
  type CacheInfo,
  type WritingMode,
} from "../lib/ai-client";
import { renderMarkdown } from "../lib/markdown";
import { Button } from "../components/ui/Button";
import { CrescentIcon } from "../components/ui/CosmicIcons";
import { ScrollArea } from "../components/ui/ScrollArea";

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  thinkingFallback?: boolean;
  pending?: boolean;
  toolResults?: ToolResult[];
  cacheInfo?: CacheInfo;
}

let msgId = 0;
function nextId() {
  return `msg-${++msgId}-${Date.now()}`;
}

export function LunaPage() {
  const { profile } = useApp();
  const tasksApi = useTasksApi();
  const notesApi = useNotesApi();
  const projectsApi = useProjects();
  const meetingApi = useMeetingSessions();
  const { activeSession, sessions: meetingSessions } = meetingApi;
  const userName: string = profile?.displayName ?? "";

  useEffect(() => {
    void tasksApi.fetchArchivedTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [chatLoaded, setChatLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await getLunaChat();
        const parsed = stored as unknown as UIMessage[];
        for (const m of parsed) {
          const match = m.id?.match(/^msg-(\d+)-/);
          if (match) msgId = Math.max(msgId, parseInt(match[1], 10));
        }
        setMessages(parsed.map((m) => ({ ...m, pending: false })));
      } catch {
        setMessages([]);
      } finally {
        setChatLoaded(true);
      }
    })();
  }, []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinkingMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const activeAssistantHasOutputRef = useRef(false);
  const thinkingFallbackRef = useRef(false);
  const toolBatchMessageIdRef = useRef<string | null>(null);
  const notifyBatchScopeRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!chatLoaded || messages.some((m) => m.pending)) return;
    void setLunaChat(messages);
  }, [messages, chatLoaded]);

  useEffect(() => {
    const reloadChat = () => {
      void (async () => {
        try {
          const stored = await getLunaChat();
          const parsed = stored as UIMessage[];
          for (const m of parsed) {
            const match = m.id?.match(/^msg-(\d+)-/);
            if (match) msgId = Math.max(msgId, parseInt(match[1], 10));
          }
          setMessages(parsed.map((m) => ({ ...m, pending: false })));
        } catch {
          setMessages([]);
        }
      })();
    };
    window.addEventListener("orbit:data:changed", reloadChat);
    return () => window.removeEventListener("orbit:data:changed", reloadChat);
  }, []);

  // Re-render when AI settings change
  const [, setAiTick] = useState(0);
  useEffect(() => {
    const handler = () => setAiTick((t) => t + 1);
    window.addEventListener("orbit:ai:changed", handler);
    return () => window.removeEventListener("orbit:ai:changed", handler);
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (tasksApi.activeTasks.length === 0) void tasksApi.fetchActiveTasks();
    if (notesApi.notes.length === 0) void notesApi.fetchNotes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const ensureActiveAssistantMessage = useCallback(() => {
    if (activeAssistantMessageIdRef.current) {
      return activeAssistantMessageIdRef.current;
    }

    const id = nextId();
    activeAssistantMessageIdRef.current = id;
    activeAssistantHasOutputRef.current = false;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: "assistant",
        content: "",
        thinkingFallback: thinkingFallbackRef.current,
        pending: true,
      },
    ]);
    return id;
  }, []);

  const ensureToolBatch = useCallback(() => {
    if (toolBatchMessageIdRef.current) return toolBatchMessageIdRef.current;
    const id = nextId();
    toolBatchMessageIdRef.current = id;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: "assistant",
        content: "",
        toolResults: [],
      },
    ]);
    scrollToBottom();
    return id;
  }, [scrollToBottom]);

  const appendToolPending = useCallback(
    (tool: string, label: string) => {
      ensureToolBatch();
      setMessages((prev) =>
        prev.map((message) =>
          message.id === toolBatchMessageIdRef.current
            ? {
                ...message,
                toolResults: [
                  ...(message.toolResults ?? []),
                  { tool, status: "pending" as const, label },
                ],
              }
            : message,
        ),
      );
      scrollToBottom();
    },
    [ensureToolBatch, scrollToBottom],
  );

  const resolveLastTool = useCallback(
    (result: ToolResult) => {
      const batchId = toolBatchMessageIdRef.current;
      if (!batchId) return;
      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== batchId) return message;
          const results = [...(message.toolResults ?? [])];
          if (results.length > 0) results[results.length - 1] = result;
          return { ...message, toolResults: results };
        }),
      );
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const lunaNotifyAction = useCallback(
    (action: string, subject: string | undefined, ok: boolean) => {
      notify(
        buildLunaNotifyEvent(
          action,
          subject,
          ok,
          notifyBatchScopeRef.current,
        ),
      );
    },
    [],
  );

  const finalizeLunaTurn = useCallback(() => {
    flushNotifyGroup(notifyBatchScopeRef.current);
    toolBatchMessageIdRef.current = null;
    notifyBatchScopeRef.current = null;
  }, []);

  const waitForNextPaint = useCallback(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    [],
  );

  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || streaming) return;

      const apiKey = hasApiKey();
      if (!apiKey) {
        notify({
          source: "user",
          kind: "error",
          action: "generic",
          message: "Add your API key in Settings → Luna first",
          immediate: true,
        });
        return;
      }

      if (!isFeatureReady("lunaChat")) {
        notify({
          source: "user",
          kind: "error",
          action: "generic",
          message: "Enable Luna chat in Settings → Luna first",
          immediate: true,
        });
        return;
      }

      notifyBatchScopeRef.current = `luna-turn-${nextId()}`;
      toolBatchMessageIdRef.current = null;

      const userMsg: UIMessage = {
        id: nextId(),
        role: "user",
        content: text,
      };
      const assistantMsg: UIMessage = {
        id: nextId(),
        role: "assistant",
        content: "",
        thinkingFallback: false,
        pending: true,
      };

      activeAssistantMessageIdRef.current = assistantMsg.id;
      activeAssistantHasOutputRef.current = false;
      thinkingFallbackRef.current = false;

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setStreaming(true);

      // Build conversation history for the API
      // Fetch sub-tasks for active tasks so Luna sees the full picture
      const tasksWithSubTasks = await Promise.all(
        tasksApi.activeTasks.map(async (t) => {
          const subTasks = await tasksApi.fetchSubTasks(t.id);
          return {
            title: t.title,
            description: t.description,
            priority: t.priority,
            due_date: t.due_date,
            completed: t.completed,
            subTasks: subTasks.map((st) => ({
              title: st.title,
              completed: st.completed,
            })),
          };
        }),
      );

      const history: ChatMessage[] = [
        {
          role: "system",
          content: buildLunaSystemPrompt({
            tasks: tasksWithSubTasks,
            archivedTasks: tasksApi.archivedTasks.map((t) => ({
              title: t.title,
              description: t.description,
              priority: t.priority,
              completed: t.completed,
            })),
            notes: notesApi.notes.map((n) => ({
              title: n.title,
              content: n.content,
              updated_at: n.updated_at,
            })),
            projects: projectsApi.projects.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              deadline: p.deadline,
              taskIds: p.taskIds,
              noteIds: p.noteIds,
            })),
            meetingSessions: {
              active: activeSession
                ? {
                    title: activeSession.title,
                    startedAt: activeSession.startedAt,
                    entries: activeSession.entries.map((e) => ({
                      content: e.content,
                      createdAt: e.createdAt,
                    })),
                  }
                : null,
              completed: meetingSessions.map((s) => ({
                title: s.title,
                endedAt: s.endedAt,
                artifactNote: s.artifacts?.note.title ?? null,
                artifactTask: s.artifacts?.task.title ?? null,
              })),
            },
          }),
        },
        // Include previous conversation (excluding pending/tool metadata)
        ...messages
          .filter((m) => m.content.trim())
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        { role: "user" as const, content: text },
      ];

      const controller = new AbortController();
      abortRef.current = controller;

      const shouldThink = thinkingMode && activeModelSupportsThinking();

      try {
        await streamLunaChat(
          history,
          "",
          {
          onToken: (token) => {
            const activeId = ensureActiveAssistantMessage();
            activeAssistantHasOutputRef.current = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === activeId ? { ...m, content: m.content + token } : m,
              ),
            );
            scrollToBottom();
          },
          onReasoningToken: (token) => {
            const activeId = ensureActiveAssistantMessage();
            activeAssistantHasOutputRef.current = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === activeId
                  ? { ...m, reasoning: (m.reasoning ?? "") + token }
                  : m,
              ),
            );
            scrollToBottom();
          },
          onCacheInfo: (info) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, cacheInfo: info } : m,
              ),
            );
          },
          onThinkingFallback: () => {
            thinkingFallbackRef.current = true;
            const activeId = ensureActiveAssistantMessage();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === activeId ? { ...m, thinkingFallback: true } : m,
              ),
            );
          },
          onToolCall: async (name, args) => {
            const snap = await getLunaSnapshot();

            if (name === "create_task") {
              const title = String(args.title ?? "Untitled task");
              const description = args.description
                ? String(args.description)
                : undefined;
              const priority = (["low", "medium", "high"] as const).includes(
                args.priority as "low" | "medium" | "high",
              )
                ? (args.priority as "low" | "medium" | "high")
                : "medium";
              const dueDate = args.due_date ? String(args.due_date) : undefined;
              const subTasks = Array.isArray(args.sub_tasks)
                ? (args.sub_tasks as string[]).map((s) => ({
                    title: String(s),
                  }))
                : [];
              const taskProjectName = args.project_name
                ? String(args.project_name)
                : undefined;
              appendToolPending("create_task", `Creating task: ${title}`);
              await waitForNextPaint();

              const taskId = await tasksApi.createTask({
                title,
                description,
                priority,
                due_date: dueDate,
              });
              if (taskId && subTasks.length > 0) {
                await tasksApi.saveSubTasks(taskId, subTasks, []);
              }
              if (taskId && taskProjectName) {
                const proj =
                  snap.projects.find(
                    (p) =>
                      p.name.toLowerCase() === taskProjectName.toLowerCase(),
                  ) ??
                  snap.projects.find((p) =>
                    p.name
                      .toLowerCase()
                      .includes(taskProjectName.toLowerCase()),
                  );
                if (proj) await projectsApi.linkTask(proj.id, taskId);
              }
              const ok = !!taskId;
              resolveLastTool( {
                tool: "create_task",
                status: ok ? "success" : "error",
                label: ok ? `Created task: ${title}` : "Failed to create task",
              });
              lunaNotifyAction("create_task", title, ok);
              return ok
                ? `Task created successfully: "${title}"${
                    taskProjectName
                      ? ` (linked to project "${taskProjectName}")`
                      : ""
                  }`
                : "Failed to create task";
            }

            if (name === "create_note") {
              const title = String(args.title ?? "Untitled note");
              const content = args.content ? String(args.content) : undefined;
              const noteProjectName = args.project_name
                ? String(args.project_name)
                : undefined;
              appendToolPending("create_note", `Making note: ${title}`);
              await waitForNextPaint();
              const noteId = await notesApi.createNote({
                title,
                content,
              });
              if (noteId && noteProjectName) {
                const proj =
                  snap.projects.find(
                    (p) =>
                      p.name.toLowerCase() === noteProjectName.toLowerCase(),
                  ) ??
                  snap.projects.find((p) =>
                    p.name
                      .toLowerCase()
                      .includes(noteProjectName.toLowerCase()),
                  );
                if (proj) await projectsApi.linkNote(proj.id, noteId);
              }
              const ok = !!noteId;
              resolveLastTool( {
                tool: "create_note",
                status: ok ? "success" : "error",
                label: ok ? `Created note: ${title}` : "Failed to create note",
              });
              lunaNotifyAction("create_note", title, ok);
              return ok
                ? `Note created successfully: "${title}"${
                    noteProjectName
                      ? ` (linked to project "${noteProjectName}")`
                      : ""
                  }`
                : "Failed to create note";
            }

            if (name === "archive_task") {
              const taskTitle = String(args.task_title ?? "");
              const match =
                snap.activeTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.activeTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              if (!match) {
                return `Could not find an active task matching "${taskTitle}"`;
              }
              appendToolPending("archive_task", `Archiving: ${match.title}`);
              await waitForNextPaint();
              const ok = await tasksApi.archiveTask(match.id);
              resolveLastTool( {
                tool: "archive_task",
                status: ok ? "success" : "error",
                label: ok
                  ? `Archived task: ${match.title}`
                  : "Failed to archive task",
              });
              lunaNotifyAction("archive_task", match.title, ok);
              return ok
                ? `Task archived: "${match.title}"`
                : "Failed to archive task";
            }

            if (name === "complete_task") {
              const taskTitle = String(args.task_title ?? "");
              const match =
                snap.activeTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.activeTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              if (!match) {
                return `Could not find an active task matching "${taskTitle}"`;
              }
              appendToolPending("complete_task", `Completing: ${match.title}`);
              await waitForNextPaint();
              const ok = await tasksApi.toggleComplete(match.id, true);
              resolveLastTool( {
                tool: "complete_task",
                status: ok ? "success" : "error",
                label: ok
                  ? `Completed task: ${match.title}`
                  : "Failed to complete task",
              });
              lunaNotifyAction("complete_task", match.title, ok);
              return ok
                ? `Task marked complete: "${match.title}"`
                : "Failed to complete task";
            }

            if (name === "delete_note") {
              const noteTitle = String(args.note_title ?? "");
              const match =
                snap.notes.find(
                  (n) => n.title.toLowerCase() === noteTitle.toLowerCase(),
                ) ??
                snap.notes.find((n) =>
                  n.title.toLowerCase().includes(noteTitle.toLowerCase()),
                );
              if (!match) {
                return `Could not find a note matching "${noteTitle}"`;
              }
              appendToolPending("delete_note", `Deleting note: ${match.title}`);
              await waitForNextPaint();
              const ok = await notesApi.deleteNote(match.id);
              resolveLastTool( {
                tool: "delete_note",
                status: ok ? "success" : "error",
                label: ok
                  ? `Deleted note: ${match.title}`
                  : "Failed to delete note",
              });
              lunaNotifyAction("delete_note", match.title, ok);
              return ok
                ? `Note deleted: "${match.title}"`
                : "Failed to delete note";
            }

            if (name === "transform_text") {
              const text = String(args.text ?? "");
              const mode = String(args.mode ?? "improve") as WritingMode;
              if (!text.trim()) return "No text provided to transform.";
              appendToolPending("transform_text", `Applying ${mode} transformation…`);
              await waitForNextPaint();
              const result = await processWriting(
                text,
                mode,
                mode === "email" ? userName : undefined,
              );
              if (result.text) {
                resolveLastTool( {
                  tool: "transform_text",
                  status: "success",
                  label: `Text transformed (${mode})`,
                });
                lunaNotifyAction("transform_text", undefined, true);
                return `Transformed text:\n\n${result.text}`;
              } else {
                resolveLastTool( {
                  tool: "transform_text",
                  status: "error",
                  label: "Text transformation failed",
                });
                lunaNotifyAction("transform_text", undefined, false);
                return result.error ?? "Failed to transform text.";
              }
            }

            if (name === "start_meeting") {
              const title = String(args.title ?? "Meeting");
              if (meetingApi.activeSession) {
                return `A meeting session is already active: "${meetingApi.activeSession.title}". End it first.`;
              }
              appendToolPending("start_meeting", `Starting meeting: ${title}`);
              await waitForNextPaint();
              const session = meetingApi.startSession(title);
              const ok = !!session;
              resolveLastTool( {
                tool: "start_meeting",
                status: ok ? "success" : "error",
                label: ok
                  ? `Meeting started: ${title}`
                  : "Failed to start meeting",
              });
              lunaNotifyAction("start_meeting", title, ok);
              return ok
                ? `Meeting session started: "${title}"`
                : "Failed to start meeting session.";
            }

            if (name === "add_meeting_entry") {
              const content = String(args.content ?? "");
              if (!content.trim())
                return "No content provided for meeting entry.";
              if (!meetingApi.activeSession) {
                return "No active meeting session. Start one first with start_meeting.";
              }
              appendToolPending("add_meeting_entry", `Adding meeting entry…`);
              await waitForNextPaint();
              const ok = meetingApi.addEntry(content);
              resolveLastTool( {
                tool: "add_meeting_entry",
                status: ok ? "success" : "error",
                label: ok ? "Meeting entry added" : "Failed to add entry",
              });
              lunaNotifyAction("add_meeting_entry", undefined, ok);
              return ok
                ? `Meeting entry added: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`
                : "Failed to add meeting entry.";
            }

            if (name === "end_meeting") {
              if (!meetingApi.activeSession) {
                return "No active meeting session to end.";
              }
              const title = meetingApi.activeSession.title;
              appendToolPending("end_meeting", `Ending meeting: ${title}`);
              await waitForNextPaint();
              const ok = meetingApi.discardActiveSession();
              resolveLastTool( {
                tool: "end_meeting",
                status: ok ? "success" : "error",
                label: ok ? `Meeting ended: ${title}` : "Failed to end meeting",
              });
              lunaNotifyAction("end_meeting", title, ok);
              return ok
                ? `Meeting session ended: "${title}"`
                : "Failed to end meeting session.";
            }

            if (name === "recategorize_tasks") {
              appendToolPending("recategorize_tasks", "Regenerating task categories…");
              await waitForNextPaint();
              await setTaskCategories({});
              window.dispatchEvent(new Event("orbit:categories:cleared"));
              await waitForNextPaint();
              void tasksApi.backgroundCategorize(snap.activeTasks);
              resolveLastTool( {
                tool: "recategorize_tasks",
                status: "success",
                label: "Task categories cleared  -  regenerating in background",
              });
              lunaNotifyAction("recategorize_tasks", undefined, true);
              return "Task categories have been cleared and are being regenerated in the background.";
            }

            if (name === "recategorize_notes") {
              appendToolPending("recategorize_notes", "Regenerating note categories…");
              await waitForNextPaint();
              await setNoteCategories({});
              window.dispatchEvent(new Event("orbit:note-categories:cleared"));
              await waitForNextPaint();
              void notesApi.backgroundCategorize(snap.notes);
              resolveLastTool( {
                tool: "recategorize_notes",
                status: "success",
                label: "Note categories cleared  -  regenerating in background",
              });
              lunaNotifyAction("recategorize_notes", undefined, true);
              return "Note categories have been cleared and are being regenerated in the background.";
            }

            if (name === "update_task") {
              const taskTitle = String(args.task_title ?? "");
              const match =
                snap.activeTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.activeTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              if (!match) {
                return `Could not find an active task matching "${taskTitle}"`;
              }
              const updates: {
                title?: string;
                description?: string;
                priority?: "low" | "medium" | "high";
                due_date?: string | null;
              } = {};
              if (args.new_title) updates.title = String(args.new_title);
              if (args.description !== undefined)
                updates.description = String(args.description);
              if (
                args.priority === "low" ||
                args.priority === "medium" ||
                args.priority === "high"
              )
                updates.priority = args.priority;
              if (args.due_date !== undefined)
                updates.due_date =
                  args.due_date === "" ? null : String(args.due_date);
              appendToolPending("update_task", `Updating task: ${match.title}`);
              await waitForNextPaint();
              const ok = await tasksApi.updateTask(match.id, updates);
              resolveLastTool( {
                tool: "update_task",
                status: ok ? "success" : "error",
                label: ok
                  ? `Updated task: ${updates.title ?? match.title}`
                  : "Failed to update task",
              });
              lunaNotifyAction("update_task", updates.title ?? match.title, ok);
              return ok
                ? `Task updated: "${updates.title ?? match.title}"`
                : "Failed to update task";
            }

            if (name === "add_subtasks") {
              const taskTitle = String(args.task_title ?? "");
              const newSubTasks = Array.isArray(args.sub_tasks)
                ? (args.sub_tasks as string[]).map((s) => String(s))
                : [];
              if (newSubTasks.length === 0) {
                return "No sub-tasks provided.";
              }
              const match =
                snap.activeTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.activeTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              if (!match) {
                return `Could not find an active task matching "${taskTitle}"`;
              }
              appendToolPending("add_subtasks", `Adding ${newSubTasks.length} sub-task(s) to: ${match.title}`);
              await waitForNextPaint();
              // Fetch existing sub-tasks to preserve them
              const existing = await tasksApi.fetchSubTasks(match.id);
              const existingIds = existing.map((st) => st.id);
              const merged = [
                ...existing.map((st) => ({
                  id: st.id,
                  title: st.title,
                  completed: st.completed,
                })),
                ...newSubTasks.map((title) => ({ title, completed: false })),
              ];
              const ok = await tasksApi.saveSubTasks(
                match.id,
                merged,
                existingIds,
              );
              resolveLastTool( {
                tool: "add_subtasks",
                status: ok ? "success" : "error",
                label: ok
                  ? `Added ${newSubTasks.length} sub-task(s) to: ${match.title}`
                  : "Failed to add sub-tasks",
              });
              lunaNotifyAction("add_subtasks", match.title, ok);
              return ok
                ? `Added ${newSubTasks.length} sub-task(s) to "${match.title}": ${newSubTasks.map((s) => `"${s}"`).join(", ")}`
                : "Failed to add sub-tasks";
            }

            if (name === "update_note") {
              const noteTitle = String(args.note_title ?? "");
              const match =
                snap.notes.find(
                  (n) => n.title.toLowerCase() === noteTitle.toLowerCase(),
                ) ??
                snap.notes.find((n) =>
                  n.title.toLowerCase().includes(noteTitle.toLowerCase()),
                );
              if (!match) {
                return `Could not find a note matching "${noteTitle}"`;
              }
              const updates: { title?: string; content?: string } = {};
              if (args.new_title) updates.title = String(args.new_title);
              if (args.content !== undefined)
                updates.content = String(args.content);
              appendToolPending("update_note", `Updating note: ${match.title}`);
              await waitForNextPaint();
              const ok = await notesApi.updateNote(match.id, updates);
              resolveLastTool( {
                tool: "update_note",
                status: ok ? "success" : "error",
                label: ok
                  ? `Updated note: ${updates.title ?? match.title}`
                  : "Failed to update note",
              });
              lunaNotifyAction("update_note", updates.title ?? match.title, ok);
              return ok
                ? `Note updated: "${updates.title ?? match.title}"`
                : "Failed to update note";
            }

            if (name === "create_project") {
              const projectName = String(args.name ?? "Untitled Project");
              const description = args.description
                ? String(args.description)
                : undefined;
              const deadline = args.deadline ? String(args.deadline) : null;
              appendToolPending("create_project", `Creating project: ${projectName}`);
              await waitForNextPaint();
              const project = await projectsApi.createProject({
                name: projectName,
                description,
                deadline,
              });
              const ok = !!project;
              resolveLastTool( {
                tool: "create_project",
                status: ok ? "success" : "error",
                label: ok
                  ? `Created project: ${projectName}`
                  : "Failed to create project",
              });
              lunaNotifyAction("create_project", projectName, ok);
              return ok
                ? `Project created: "${projectName}"`
                : "Failed to create project";
            }

            if (name === "link_task_to_project") {
              const taskTitle = String(args.task_title ?? "");
              const projectName = String(args.project_name ?? "");
              const task =
                snap.activeTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.activeTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              if (!task) {
                return `Could not find an active task matching "${taskTitle}"`;
              }
              const project =
                snap.projects.find(
                  (p) => p.name.toLowerCase() === projectName.toLowerCase(),
                ) ??
                snap.projects.find((p) =>
                  p.name.toLowerCase().includes(projectName.toLowerCase()),
                );
              if (!project) {
                return `Could not find a project matching "${projectName}"`;
              }
              appendToolPending("link_task_to_project", `Linking "${task.title}" → "${project.name}"`);
              await waitForNextPaint();
              await projectsApi.linkTask(project.id, task.id);
              resolveLastTool( {
                tool: "link_task_to_project",
                status: "success",
                label: `Linked task to project: ${project.name}`,
              });
              lunaNotifyAction("link_task_to_project", project.name, true);
              return `Task "${task.title}" linked to project "${project.name}"`;
            }

            if (name === "link_note_to_project") {
              const noteTitle = String(args.note_title ?? "");
              const projectName = String(args.project_name ?? "");
              const note =
                snap.notes.find(
                  (n) => n.title.toLowerCase() === noteTitle.toLowerCase(),
                ) ??
                snap.notes.find((n) =>
                  n.title.toLowerCase().includes(noteTitle.toLowerCase()),
                );
              if (!note) {
                return `Could not find a note matching "${noteTitle}"`;
              }
              const project =
                snap.projects.find(
                  (p) => p.name.toLowerCase() === projectName.toLowerCase(),
                ) ??
                snap.projects.find((p) =>
                  p.name.toLowerCase().includes(projectName.toLowerCase()),
                );
              if (!project) {
                return `Could not find a project matching "${projectName}"`;
              }
              appendToolPending("link_note_to_project", `Linking "${note.title}" → "${project.name}"`);
              await waitForNextPaint();
              await projectsApi.linkNote(project.id, note.id);
              resolveLastTool( {
                tool: "link_note_to_project",
                status: "success",
                label: `Linked note to project: ${project.name}`,
              });
              lunaNotifyAction("link_note_to_project", project.name, true);
              return `Note "${note.title}" linked to project "${project.name}"`;
            }

            if (name === "unarchive_task") {
              const taskTitle = String(args.task_title ?? "");
              const match =
                snap.archivedTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.archivedTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              if (!match) {
                return `Could not find an archived task matching "${taskTitle}"`;
              }
              appendToolPending("unarchive_task", `Restoring: ${match.title}`);
              await waitForNextPaint();
              const ok = await tasksApi.unarchiveTask(match.id);
              resolveLastTool( {
                tool: "unarchive_task",
                status: ok ? "success" : "error",
                label: ok
                  ? `Restored task: ${match.title}`
                  : "Failed to restore task",
              });
              lunaNotifyAction("unarchive_task", match.title, ok);
              return ok
                ? `Task restored from archive: "${match.title}"`
                : "Failed to restore task from archive";
            }

            if (name === "delete_task") {
              const taskTitle = String(args.task_title ?? "");
              // Check active tasks first, then archived
              const activeMatch =
                snap.activeTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.activeTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              const archivedMatch =
                snap.archivedTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.archivedTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              const match = activeMatch ?? archivedMatch;
              if (!match) {
                return `Could not find a task matching "${taskTitle}"`;
              }
              appendToolPending("delete_task", `Deleting task: ${match.title}`);
              await waitForNextPaint();
              let ok: boolean;
              if (activeMatch) {
                // Archive first, then delete forever
                ok = await tasksApi.archiveTask(match.id);
                if (ok) ok = await tasksApi.deleteForever(match.id);
              } else {
                ok = await tasksApi.deleteForever(match.id);
              }
              resolveLastTool( {
                tool: "delete_task",
                status: ok ? "success" : "error",
                label: ok
                  ? `Deleted task: ${match.title}`
                  : "Failed to delete task",
              });
              lunaNotifyAction("delete_task", match.title, ok);
              return ok
                ? `Task permanently deleted: "${match.title}"`
                : "Failed to delete task";
            }

            if (name === "delete_project") {
              const projectName = String(args.project_name ?? "");
              const project =
                snap.projects.find(
                  (p) => p.name.toLowerCase() === projectName.toLowerCase(),
                ) ??
                snap.projects.find((p) =>
                  p.name.toLowerCase().includes(projectName.toLowerCase()),
                );
              if (!project) {
                return `Could not find a project matching "${projectName}"`;
              }
              appendToolPending("delete_project", `Deleting project: ${project.name}`);
              await waitForNextPaint();
              const ok = await projectsApi.deleteProject(project.id);
              resolveLastTool( {
                tool: "delete_project",
                status: ok ? "success" : "error",
                label: ok
                  ? `Deleted project: ${project.name}`
                  : "Failed to delete project",
              });
              lunaNotifyAction("delete_project", project.name, ok);
              return ok
                ? `Project deleted: "${project.name}" (linked tasks and notes were kept)`
                : "Failed to delete project";
            }

            if (name === "update_project") {
              const projectName = String(args.project_name ?? "");
              const project =
                snap.projects.find(
                  (p) => p.name.toLowerCase() === projectName.toLowerCase(),
                ) ??
                snap.projects.find((p) =>
                  p.name.toLowerCase().includes(projectName.toLowerCase()),
                );
              if (!project) {
                return `Could not find a project matching "${projectName}"`;
              }
              const updates: {
                name?: string;
                description?: string;
                deadline?: string | null;
              } = {};
              if (args.new_name) updates.name = String(args.new_name);
              if (args.description !== undefined)
                updates.description = String(args.description);
              if (args.deadline !== undefined)
                updates.deadline =
                  args.deadline === "" ? null : String(args.deadline);
              appendToolPending("update_project", `Updating project: ${project.name}`);
              await waitForNextPaint();
              const ok = await projectsApi.updateProject(project.id, updates);
              resolveLastTool( {
                tool: "update_project",
                status: ok ? "success" : "error",
                label: ok
                  ? `Updated project: ${updates.name ?? project.name}`
                  : "Failed to update project",
              });
              lunaNotifyAction("update_project", updates.name ?? project.name, ok);
              return ok
                ? `Project updated: "${updates.name ?? project.name}"`
                : "Failed to update project";
            }

            if (name === "unlink_task_from_project") {
              const taskTitle = String(args.task_title ?? "");
              const projectName = String(args.project_name ?? "");
              const task =
                snap.activeTasks.find(
                  (t) => t.title.toLowerCase() === taskTitle.toLowerCase(),
                ) ??
                snap.activeTasks.find((t) =>
                  t.title.toLowerCase().includes(taskTitle.toLowerCase()),
                );
              if (!task) {
                return `Could not find an active task matching "${taskTitle}"`;
              }
              const project =
                snap.projects.find(
                  (p) => p.name.toLowerCase() === projectName.toLowerCase(),
                ) ??
                snap.projects.find((p) =>
                  p.name.toLowerCase().includes(projectName.toLowerCase()),
                );
              if (!project) {
                return `Could not find a project matching "${projectName}"`;
              }
              appendToolPending("unlink_task_from_project", `Unlinking "${task.title}" from "${project.name}"`);
              await waitForNextPaint();
              await projectsApi.unlinkTask(project.id, task.id);
              resolveLastTool( {
                tool: "unlink_task_from_project",
                status: "success",
                label: `Unlinked task from project: ${project.name}`,
              });
              lunaNotifyAction("unlink_task_from_project", project.name, true);
              return `Task "${task.title}" unlinked from project "${project.name}"`;
            }

            if (name === "unlink_note_from_project") {
              const noteTitle = String(args.note_title ?? "");
              const projectName = String(args.project_name ?? "");
              const note =
                snap.notes.find(
                  (n) => n.title.toLowerCase() === noteTitle.toLowerCase(),
                ) ??
                snap.notes.find((n) =>
                  n.title.toLowerCase().includes(noteTitle.toLowerCase()),
                );
              if (!note) {
                return `Could not find a note matching "${noteTitle}"`;
              }
              const project =
                snap.projects.find(
                  (p) => p.name.toLowerCase() === projectName.toLowerCase(),
                ) ??
                snap.projects.find((p) =>
                  p.name.toLowerCase().includes(projectName.toLowerCase()),
                );
              if (!project) {
                return `Could not find a project matching "${projectName}"`;
              }
              appendToolPending("unlink_note_from_project", `Unlinking "${note.title}" from "${project.name}"`);
              await waitForNextPaint();
              await projectsApi.unlinkNote(project.id, note.id);
              resolveLastTool( {
                tool: "unlink_note_from_project",
                status: "success",
                label: `Unlinked note from project: ${project.name}`,
              });
              lunaNotifyAction("unlink_note_from_project", project.name, true);
              return `Note "${note.title}" unlinked from project "${project.name}"`;
            }

            return "Unknown tool";
          },
          onDone: (fullText, reasoning) => {
            const activeId = activeAssistantMessageIdRef.current;
            if (activeId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === activeId
                    ? {
                        ...m,
                        content: fullText || m.content,
                        reasoning: reasoning ?? m.reasoning,
                        pending: false,
                      }
                    : m,
                ),
              );
            }
            activeAssistantMessageIdRef.current = null;
            activeAssistantHasOutputRef.current = false;
            thinkingFallbackRef.current = false;
            finalizeLunaTurn();
            setStreaming(false);
            abortRef.current = null;
            scrollToBottom();
          },
          onError: (error) => {
            const activeId = activeAssistantMessageIdRef.current;
            if (activeId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === activeId
                    ? {
                        ...m,
                        content: m.content || error,
                        pending: false,
                      }
                    : m,
                ),
              );
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: nextId(),
                  role: "assistant",
                  content: error,
                },
              ]);
            }
            activeAssistantMessageIdRef.current = null;
            activeAssistantHasOutputRef.current = false;
            thinkingFallbackRef.current = false;
            finalizeLunaTurn();
            setStreaming(false);
            abortRef.current = null;
          },
        },
        controller.signal,
        {
          ...(shouldThink ? { thinkingEnabled: true } : {}),
          sessionId: notifyBatchScopeRef.current ?? undefined,
        },
        );
      } catch (error) {
        const aborted =
          error instanceof DOMException && error.name === "AbortError";
        if (!aborted) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content:
                error instanceof Error
                  ? error.message
                  : "Luna request failed.",
            },
          ]);
        }
        activeAssistantMessageIdRef.current = null;
        activeAssistantHasOutputRef.current = false;
        thinkingFallbackRef.current = false;
        finalizeLunaTurn();
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [
      appendToolPending,
      ensureActiveAssistantMessage,
      input,
      streaming,
      messages,
      tasksApi,
      notesApi,
      projectsApi,
      meetingApi,
      activeSession,
      meetingSessions,
      userName,
      scrollToBottom,
      thinkingMode,
      resolveLastTool,
      lunaNotifyAction,
      finalizeLunaTurn,
      waitForNextPaint,
    ],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeAssistantMessageIdRef.current = null;
    activeAssistantHasOutputRef.current = false;
    thinkingFallbackRef.current = false;
    finalizeLunaTurn();
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.pending ? { ...m, pending: false } : m)),
    );
  }, [finalizeLunaTurn]);

  const handleClear = useCallback(() => {
    if (streaming) handleStop();
    setMessages([]);
    void setLunaChat([]);
    inputRef.current?.focus();
  }, [streaming, handleStop]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!e.ctrlKey && !e.metaKey) {
          void handleSend();
        }
      }
    },
    [handleSend],
  );

  const hasKey = hasApiKey() && isFeatureReady("lunaChat");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <header className="shrink-0 border-b border-border-subtle px-4 pr-17 sm:px-6 sm:pr-6 h-18 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl glass-accent flex items-center justify-center shrink-0">
          <CrescentIcon size={17} active className="text-accent-text" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold font-display text-text-primary tracking-tight">
            Luna
          </h1>
          <p className="text-[10px] text-text-faint">Your Orbit AI assistant</p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px]"
            aria-label="Clear chat"
          >
            <Trash2 size={12} />
            Clear
          </Button>
        )}
      </header>

      {/* Messages area */}
      <ScrollArea
        className="flex-1 min-h-0"
        viewportClassName="overscroll-contain"
        contentClassName={messages.length === 0 ? "h-full" : undefined}
      >
        {messages.length === 0 ? (
          <EmptyChat
            hasKey={hasKey}
            onSuggestion={(text) => {
              setInput(text);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-1">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </ScrollArea>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border-subtle bg-overlay backdrop-blur-sm">
        <form
          onSubmit={handleSend}
          className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-3 flex items-end"
        >
          <div className="relative flex-1 min-w-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasKey ? "Message Luna…" : "Enable Luna in Settings → Luna"
              }
              disabled={!hasKey}
              rows={1}
              className="block w-full resize-none bg-tint-2 border border-border-default rounded-xl px-4 py-3 pr-14 text-sm text-text-primary placeholder:text-text-faint outline-none focus:border-accent/30 focus:bg-tint-3 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed max-h-36 overflow-y-auto"
              style={{
                height: "auto",
                minHeight: "48px",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
              }}
            />
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-danger/15 border border-danger/20 text-danger hover:bg-danger/25 transition-all duration-200"
                aria-label="Stop generating"
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !hasKey}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-linear-to-r from-accent to-accent-2 text-white shadow-md shadow-accent/20 hover:brightness-110 active:scale-95 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:brightness-100 disabled:active:scale-100"
                aria-label="Send message"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolResultIcon({
  tool,
  status,
}: {
  tool: string;
  status: ToolResult["status"];
}) {
  if (status === "pending") {
    return <LoaderCircle size={12} className="animate-spin" />;
  }
  if (tool === "create_task" || tool === "complete_task") {
    return <CheckCircle2 size={12} />;
  }
  if (tool === "archive_task") return <Archive size={12} />;
  if (tool === "unarchive_task") return <ArchiveRestore size={12} />;
  if (tool === "create_note") return <StickyNote size={12} />;
  if (tool === "delete_note" || tool === "delete_task") {
    return <Trash2 size={12} />;
  }
  if (tool === "add_subtasks") return <ListChecks size={12} />;
  if (tool === "transform_text") return <PenLine size={12} />;
  if (
    tool === "start_meeting" ||
    tool === "add_meeting_entry" ||
    tool === "end_meeting"
  ) {
    return <Video size={12} />;
  }
  if (tool === "recategorize_tasks" || tool === "recategorize_notes") {
    return <RefreshCw size={12} />;
  }
  if (
    tool === "create_project" ||
    tool === "update_project" ||
    tool === "delete_project"
  ) {
    return <FolderOpen size={12} />;
  }
  if (
    tool === "unlink_task_from_project" ||
    tool === "unlink_note_from_project"
  ) {
    return <Unlink size={12} />;
  }
  return <StickyNote size={12} />;
}

function ToolResultsPanel({ results }: { results: ToolResult[] }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeToolResults(results);
  const hasError = results.some((r) => r.status === "error");
  const hasPending = results.some((r) => r.status === "pending");

  return (
    <div
      className={`mt-2 rounded-xl border text-xs font-medium ${
        hasError
          ? "bg-danger/8 border-danger/15"
          : "bg-emerald-500/8 border-emerald-500/15"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
          hasError ? "text-danger/90" : "text-emerald-400/90"
        }`}
      >
        {hasPending ? (
          <LoaderCircle size={12} className="animate-spin shrink-0" />
        ) : hasError ? (
          <Trash2 size={12} className="shrink-0" />
        ) : (
          <CheckCircle2 size={12} className="shrink-0" />
        )}
        <span className="flex-1">{summary}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className={`border-t px-3 py-2 space-y-1 ${
            hasError ? "border-danger/10" : "border-emerald-500/10"
          }`}
        >
          {results.map((tr, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 py-1 ${
                tr.status === "success"
                  ? "text-emerald-400/80"
                  : tr.status === "error"
                    ? "text-danger/80"
                    : "text-text-secondary"
              }`}
            >
              <ToolResultIcon tool={tr.tool} status={tr.status} />
              <span>{tr.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const hasToolResults = !!message.toolResults?.length;
  const showTextBubble =
    isUser || !!message.content || (!hasToolResults && message.pending);

  return (
    <div
      className={`flex gap-3 py-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-lg glass-accent flex items-center justify-center mt-0.5">
          <CrescentIcon size={15} active className="text-accent-text" />
        </div>
      )}

      <div
        className={`min-w-0 max-w-[85%] sm:max-w-[75%] ${isUser ? "order-first" : ""}`}
      >
        {!isUser && message.thinkingFallback && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/15 bg-amber-500/7 px-3 py-1.5 text-[11px] font-medium text-amber-300/80">
              <Sparkles size={11} />
              Thinking mode unavailable, retried without it
            </span>
          </div>
        )}

        {/* Reasoning (thinking) collapsible */}
        {!isUser && message.reasoning && (
          <div className="mb-2">
            <button
              onClick={() => setReasoningOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-amber-400/70 hover:text-amber-400 bg-amber-500/5 border border-amber-500/10 hover:border-amber-500/20 transition-all duration-200"
            >
              <Sparkles size={11} />
              Thinking
              <ChevronDown
                size={11}
                className={`transition-transform duration-200 ${reasoningOpen ? "rotate-180" : ""}`}
              />
            </button>
            {reasoningOpen && (
              <ScrollArea
                className="mt-1.5 max-h-64 rounded-xl bg-amber-500/5 border border-amber-500/10"
                viewportClassName="max-h-64"
              >
                <div className="px-3.5 py-2.5 text-xs text-amber-200/50 leading-relaxed whitespace-pre-wrap">
                  {message.reasoning}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {showTextBubble && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed overflow-hidden break-words ${
              isUser
                ? "bg-linear-to-r from-accent to-accent-2 border border-accent/15 text-white rounded-br-md"
                : "bg-tint-2 border border-border-subtle text-text-secondary rounded-bl-md"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap wrap-break-word">
                {message.content}
              </p>
            ) : message.content ? (
              <div className="prose-luna min-w-0 max-w-full">
                {renderMarkdown(message.content)}
              </div>
            ) : message.pending ? (
              <div className="flex items-center gap-1.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-text/60 animate-bounce" />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-accent-text/60 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-accent-text/60 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            ) : null}
          </div>
        )}

        {message.toolResults && message.toolResults.length > 0 && (
          <ToolResultsPanel results={message.toolResults} />
        )}

        {/* Cache info */}
        {message.cacheInfo &&
          (message.cacheInfo.cacheHitTokens > 0 ||
            message.cacheInfo.cacheMissTokens > 0) && (
            <div className="mt-1.5 px-3 py-1 text-[10px] text-text-faint">
              Cache: {message.cacheInfo.cacheHitTokens} hit /{" "}
              {message.cacheInfo.cacheMissTokens} miss tokens
            </div>
          )}
      </div>

      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-lg bg-tint-3 border border-border-default flex items-center justify-center mt-0.5">
          <UserIcon size={13} className="text-text-muted" />
        </div>
      )}
    </div>
  );
}

function EmptyChat({
  hasKey,
  onSuggestion,
}: {
  hasKey: boolean;
  onSuggestion: (text: string) => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl glass-accent flex items-center justify-center mb-5">
        <CrescentIcon size={30} active className="text-accent-text" />
      </div>
      <h2 className="text-xl font-bold font-display text-text-primary mb-2">
        Chat with Luna
      </h2>
      <p className="text-sm text-text-muted max-w-xs leading-relaxed mb-7">
        {hasKey
          ? "Ask about your tasks and notes, get advice, or have Luna create things for you."
          : "Enable Luna chat and add an API key in Settings → Luna to start chatting."}
      </p>
      {hasKey && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-md w-full">
          {[
            "What tasks should I focus on today?",
            "Create a task to review project docs",
            "Summarize my current notes",
            "Start a meeting called Weekly Sync",
          ].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="text-left px-4 py-3 rounded-xl glass glass-interactive text-[13px] text-text-secondary hover:text-text-primary transition-all duration-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
