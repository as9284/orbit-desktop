import { useState, useCallback, useMemo, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  FileText,
  Sparkles,
  CalendarDays,
  ListTodo,
  StickyNote,
  Link,
  Unlink,
  LoaderCircle,
} from "lucide-react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { orbitNotify as toast } from "../../lib/notify";
import { Modal } from "../ui/Modal";
import { ScrollArea } from "../ui/ScrollArea";
import type { Project, Task, Note } from "../../types/orbit";
import type { ProjectsApi } from "../../hooks/useProjects";
import {
  generateProjectSummary,
  type AiProjectSummary,
} from "../../lib/ai-client";
import { hasApiKey } from "../../lib/ai";
import { getProjectColorClasses } from "./projectColorOptions";

// ── Component ─────────────────────────────────────────────────────────────────

interface ProjectDetailModalProps {
  project: Project | null;
  allTasks: Task[];
  allNotes: Note[];
  projectsApi: ProjectsApi;
  onClose: () => void;
}

export function ProjectDetailModal({
  project,
  allTasks,
  allNotes,
  projectsApi,
  onClose,
}: ProjectDetailModalProps) {
  const [tab, setTab] = useState<"overview" | "tasks" | "notes">("overview");
  const [aiSummary, setAiSummary] = useState<AiProjectSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  const [displayProject, setDisplayProject] = useState(project);

  useEffect(() => {
    if (project) {
      setDisplayProject(project);
    }
  }, [project]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dp = project ?? displayProject;

  const colors = dp
    ? getProjectColorClasses(dp.color)
    : getProjectColorClasses("");

  const linkedTasks = useMemo(
    () => (dp ? allTasks.filter((t) => dp.taskIds.includes(t.id)) : []),
    [dp, allTasks],
  );
  const unlinkedTasks = useMemo(
    () =>
      dp
        ? allTasks.filter((t) => !dp.taskIds.includes(t.id) && !t.archived)
        : [],
    [dp, allTasks],
  );

  const linkedNotes = useMemo(
    () => (dp ? allNotes.filter((n) => dp.noteIds.includes(n.id)) : []),
    [dp, allNotes],
  );
  const unlinkedNotes = useMemo(
    () => (dp ? allNotes.filter((n) => !dp.noteIds.includes(n.id)) : []),
    [dp, allNotes],
  );

  const completedCount = linkedTasks.filter((t) => t.completed).length;
  const totalCount = linkedTasks.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isDeadlinePast =
    dp?.deadline &&
    isPast(parseISO(dp.deadline)) &&
    !isToday(parseISO(dp.deadline));
  const isDeadlineToday = dp?.deadline && isToday(parseISO(dp.deadline));

  const handleGenerateSummary = useCallback(async () => {
    if (!dp) return;
    setAiLoading(true);
    setAiError(null);
    const result = await generateProjectSummary(
      dp.name,
      dp.description,
      dp.deadline,
      linkedTasks.map((t) => t.title),
      completedCount,
      linkedNotes.map((n) => n.title),
    );
    setAiLoading(false);
    if (result.error) {
      setAiError(result.error);
      toast.error(result.error);
    } else {
      setAiSummary(result.summary);
    }
  }, [dp, linkedTasks, completedCount, linkedNotes]);

  function handleLinkTask(taskId: string) {
    if (!dp) return;
    projectsApi.linkTask(dp.id, taskId);
    toast.success("Task linked to project");
  }

  function handleUnlinkTask(taskId: string) {
    if (!dp) return;
    projectsApi.unlinkTask(dp.id, taskId);
    toast.success("Task unlinked");
  }

  function handleLinkNote(noteId: string) {
    if (!dp) return;
    projectsApi.linkNote(dp.id, noteId);
    toast.success("Note linked to project");
  }

  function handleUnlinkNote(noteId: string) {
    if (!dp) return;
    projectsApi.unlinkNote(dp.id, noteId);
    toast.success("Note unlinked");
  }

  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title={dp?.name ?? ""}
      maxWidth="max-w-2xl"
    >
      {dp && (
        <div className="space-y-5">
          {/* Header meta */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${colors.badge || "bg-tint-3 text-text-muted"}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}
                style={colors.hex ? { backgroundColor: colors.hex } : undefined}
              />
              {colors.hex
                ? "Custom"
                : dp.color.charAt(0).toUpperCase() + dp.color.slice(1)}
            </span>
            {dp.deadline && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                  isDeadlinePast
                    ? "bg-rose-500/15 text-rose-300"
                    : isDeadlineToday
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-tint-3 text-text-muted"
                }`}
              >
                <CalendarDays size={11} />
                {format(parseISO(dp.deadline), "MMM d, yyyy")}
                {isDeadlinePast && " · Overdue"}
                {isDeadlineToday && " · Due today"}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-tint-2 text-text-muted">
              <ListTodo size={11} />
              {totalCount} task{totalCount !== 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-tint-2 text-text-muted">
              <StickyNote size={11} />
              {linkedNotes.length} note{linkedNotes.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-text-muted">Progress</span>
                <span className="text-xs text-text-secondary font-medium tabular-nums">
                  {completedCount}/{totalCount} ({Math.round(progress)}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-tint-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                  style={
                    colors.hex
                      ? {
                          width: `${progress}%`,
                          backgroundColor: colors.hex,
                          opacity: 0.8,
                        }
                      : { width: `${progress}%` }
                  }
                />
              </div>
            </div>
          )}

          {/* Description */}
          {dp.description && (
            <p className="text-sm text-text-secondary leading-relaxed break-words">
              {dp.description}
            </p>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border-subtle pb-0 overflow-x-auto no-scrollbar">
            {(["overview", "tasks", "notes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative shrink-0 px-3 py-2 min-h-9 sm:min-h-0 text-xs font-medium transition-all duration-150 capitalize ${
                  tab === t
                    ? "text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {t}
                {tab === t && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content  -  keyed so switching triggers entry animation */}
          {/* Overview tab */}
          {tab === "overview" && (
            <div key="overview" className="space-y-4 animate-slide-up">
              {/* Luna AI summary */}
              {hasApiKey() && (
                <div className="glass rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-accent-text" />
                      <span className="text-xs font-semibold text-text-secondary">
                        Luna AI Brief
                      </span>
                    </div>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-muted text-accent-text hover:bg-accent-muted hover:brightness-110 transition-all disabled:opacity-50"
                    >
                      {aiLoading ? (
                        <>
                          <LoaderCircle
                            size={11}
                            className="animate-spin shrink-0"
                          />
                          Analyzing…
                        </>
                      ) : (
                        <>
                          <Sparkles size={11} />
                          {aiSummary ? "Refresh" : "Generate"}
                        </>
                      )}
                    </button>
                  </div>

                  {aiError && !aiLoading && (
                    <p className="text-xs text-rose-400/80">{aiError}</p>
                  )}

                  {!aiSummary && !aiLoading && !aiError && (
                    <p className="text-xs text-text-faint italic">
                      Ask Luna to analyze your project progress and suggest next
                      steps.
                    </p>
                  )}

                  {aiSummary && (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-text-primary break-words">
                        {aiSummary.headline}
                      </p>
                      <p className="text-xs text-text-secondary leading-relaxed break-words">
                        {aiSummary.status}
                      </p>
                      {aiSummary.suggestions.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                            Suggestions
                          </p>
                          <ul className="space-y-1">
                            {aiSummary.suggestions.map((s, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-text-secondary min-w-0 break-words"
                              >
                                <span className="mt-1 w-1 h-1 rounded-full bg-accent/70 shrink-0" />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiSummary.risks.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-amber-400/60 uppercase tracking-wide mb-1.5">
                            Risks
                          </p>
                          <ul className="space-y-1">
                            {aiSummary.risks.map((r, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-amber-300/70 min-w-0 break-words"
                              >
                                <span className="mt-1 w-1 h-1 rounded-full bg-amber-400/70 shrink-0" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Recent activity */}
              <div>
                <p className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">
                  Recent activity
                </p>
                {linkedTasks.length === 0 && linkedNotes.length === 0 ? (
                  <p className="text-xs text-text-faint italic">
                    No tasks or notes linked yet. Use the Tasks and Notes tabs
                    to link items.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {[...linkedTasks, ...linkedNotes]
                      .sort(
                        (a, b) =>
                          new Date(b.updated_at).getTime() -
                          new Date(a.updated_at).getTime(),
                      )
                      .slice(0, 6)
                      .map((item) => {
                        const isTask = "completed" in item;
                        return (
                          <li
                            key={item.id}
                            className="flex items-center gap-2 text-xs text-text-muted"
                          >
                            {isTask ? (
                              (item as Task).completed ? (
                                <CheckCircle2
                                  size={12}
                                  className="text-emerald-400/70 shrink-0"
                                />
                              ) : (
                                <Circle
                                  size={12}
                                  className="text-text-faint shrink-0"
                                />
                              )
                            ) : (
                              <FileText
                                size={12}
                                className="text-accent-text/70 shrink-0"
                              />
                            )}
                            <span className="truncate flex-1 min-w-0">
                              {item.title}
                            </span>
                            <span className="text-text-faint shrink-0 tabular-nums">
                              {format(parseISO(item.updated_at), "MMM d")}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Tasks tab */}
          {tab === "tasks" && (
            <div key="tasks" className="space-y-4 animate-slide-up">
              {/* Linked tasks */}
              {linkedTasks.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">
                    Linked tasks ({linkedTasks.length})
                  </p>
                  <ul className="space-y-1.5">
                    {linkedTasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 glass group"
                      >
                        {task.completed ? (
                          <CheckCircle2
                            size={13}
                            className="text-emerald-400/70 shrink-0"
                          />
                        ) : (
                          <Circle
                            size={13}
                            className="text-text-faint shrink-0"
                          />
                        )}
                        <span
                          className={`flex-1 min-w-0 truncate text-sm ${task.completed ? "line-through text-text-faint" : "text-text-secondary"}`}
                        >
                          {task.title}
                        </span>
                        <button
                          onClick={() => handleUnlinkTask(task.id)}
                          aria-label="Unlink task"
                          className="p-1 rounded-lg text-text-faint hover:text-rose-400 hover:bg-rose-500/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                        >
                          <Unlink size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Linkable tasks */}
              {unlinkedTasks.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">
                    Add tasks
                  </p>
                  <ScrollArea className="max-h-52" viewportClassName="max-h-52">
                    <ul className="space-y-1.5 pr-2">
                    {unlinkedTasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 glass group"
                      >
                        <Circle size={13} className="text-text-faint shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-sm text-text-muted">
                          {task.title}
                        </span>
                        <button
                          onClick={() => handleLinkTask(task.id)}
                          aria-label="Link task"
                          className="p-1 rounded-lg text-text-faint hover:text-accent-text hover:bg-accent-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                        >
                          <Link size={12} />
                        </button>
                      </li>
                    ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}

              {linkedTasks.length === 0 && unlinkedTasks.length === 0 && (
                <p className="text-xs text-text-faint italic">
                  No tasks available.
                </p>
              )}
            </div>
          )}

          {/* Notes tab */}
          {tab === "notes" && (
            <div key="notes" className="space-y-4 animate-slide-up">
              {/* Linked notes */}
              {linkedNotes.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">
                    Linked notes ({linkedNotes.length})
                  </p>
                  <ul className="space-y-1.5">
                    {linkedNotes.map((note) => (
                      <li
                        key={note.id}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 glass group"
                      >
                        <FileText
                          size={13}
                          className="text-accent-text/70 shrink-0"
                        />
                        <span className="flex-1 min-w-0 truncate text-sm text-text-secondary">
                          {note.title}
                        </span>
                        <button
                          onClick={() => handleUnlinkNote(note.id)}
                          aria-label="Unlink note"
                          className="p-1 rounded-lg text-text-faint hover:text-rose-400 hover:bg-rose-500/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                        >
                          <Unlink size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Linkable notes */}
              {unlinkedNotes.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">
                    Add notes
                  </p>
                  <ScrollArea className="max-h-52" viewportClassName="max-h-52">
                    <ul className="space-y-1.5 pr-2">
                    {unlinkedNotes.map((note) => (
                      <li
                        key={note.id}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 glass group"
                      >
                        <FileText
                          size={13}
                          className="text-text-faint shrink-0"
                        />
                        <span className="flex-1 min-w-0 truncate text-sm text-text-muted">
                          {note.title}
                        </span>
                        <button
                          onClick={() => handleLinkNote(note.id)}
                          aria-label="Link note"
                          className="p-1 rounded-lg text-text-faint hover:text-accent-text hover:bg-accent-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                        >
                          <Link size={12} />
                        </button>
                      </li>
                    ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}

              {linkedNotes.length === 0 && unlinkedNotes.length === 0 && (
                <p className="text-xs text-text-faint italic">
                  No notes available.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
