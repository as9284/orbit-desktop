import { useEffect, useState, useMemo } from "react";
import { orbitNotify as toast } from "../lib/notify";
import {
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  CalendarDays,
  CheckCircle2,
  ListTodo,
  StickyNote,
} from "lucide-react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { useTasksApi, useNotesApi } from "../components/layout/AppLayout";
import { useProjects } from "../hooks/useProjects";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { Spinner } from "../components/ui/Spinner";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { CreateProjectModal } from "../components/projects/CreateProjectModal";
import { EditProjectModal } from "../components/projects/EditProjectModal";
import { ProjectDetailModal } from "../components/projects/ProjectDetailModal";
import { getProjectColorClasses } from "../components/projects/projectColorOptions";
import type { Project } from "../types/orbit";
import type { AiTaskDraft } from "../lib/ai-client";

// ── Page component ────────────────────────────────────────────────────────────

export function ProjectsPage() {
  const tasksApi = useTasksApi();
  const notesApi = useNotesApi();
  const projectsApi = useProjects();

  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void tasksApi.fetchActiveTasks();
    void notesApi.fetchNotes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep detail project in sync when underlying project data changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!detailProject) return;
    const updated = projectsApi.projects.find((p) => p.id === detailProject.id);
    if (updated) setDetailProject(updated);
    else setDetailProject(null);
  }, [projectsApi.projects]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // Projects enriched with computed progress
  const enrichedProjects = useMemo(() => {
    return projectsApi.projects.map((project) => {
      const linkedTasks = tasksApi.activeTasks.filter((t) =>
        project.taskIds.includes(t.id),
      );
      const completedCount = linkedTasks.filter((t) => t.completed).length;
      const totalCount = linkedTasks.length;
      const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      return { project, completedCount, totalCount, progress };
    });
  }, [projectsApi.projects, tasksApi.activeTasks]);

  function handleDelete(id: string) {
    projectsApi.deleteProject(id);
    toast.success("Project deleted");
    setDeleteId(null);
  }

  const loading = tasksApi.loadingActive || notesApi.loading;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10 animate-fade-in">
      {/* Header */}
      <PageHeader
        className="mb-8 animate-fade-in"
        title="Projects"
        subtitle="Organize your tasks, notes, and meetings around goals."
        action={
          <Button
            variant="primary"
            className="shrink-0"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New project</span>
          </Button>
        }
      />

      {/* Loading */}
      {loading && projectsApi.projects.length === 0 && (
        <div className="flex justify-center py-20">
          <Spinner size={24} className="text-text-faint" />
        </div>
      )}

      {/* Empty state */}
      {!loading && projectsApi.projects.length === 0 && (
        <EmptyState
          float
          icon={<FolderOpen size={24} className="text-text-faint" />}
          title="No projects yet"
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} />
              New project
            </Button>
          }
        />
      )}

      {/* Project grid */}
      {projectsApi.projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {enrichedProjects.map(
            ({ project, completedCount, totalCount, progress }, index) => {
              const colors = getProjectColorClasses(project.color);
              const isOverdue =
                project.deadline &&
                isPast(parseISO(project.deadline)) &&
                !isToday(parseISO(project.deadline));
              const isDueToday =
                project.deadline && isToday(parseISO(project.deadline));

              return (
                <Card
                  interactive
                  key={project.id}
                  onClick={() => setDetailProject(project)}
                  style={{
                    animationDelay: `${index * 60}ms`,
                    ...(colors.hex
                      ? {
                          borderColor: `${colors.hex}40`,
                          boxShadow: `0 4px 24px ${colors.hex}1a`,
                        }
                      : undefined),
                  }}
                  className={`group relative cursor-pointer p-5 animate-slide-up ${colors.border} ${colors.glow}`}
                >
                  {/* Color dot accent */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors.dot}`}
                        style={
                          colors.hex
                            ? { backgroundColor: colors.hex }
                            : undefined
                        }
                      />
                      <h3 className="text-sm font-semibold text-text-primary truncate">
                        {project.name}
                      </h3>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 shrink-0">
                      <IconButton
                        label="Edit project"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditProject(project);
                        }}
                      >
                        <Pencil size={13} />
                      </IconButton>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(project.id);
                        }}
                        aria-label="Delete project"
                        className="p-1.5 rounded-lg text-text-faint hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {project.description && (
                    <p className="text-xs text-text-muted mb-3 line-clamp-2 leading-relaxed break-words">
                      {project.description}
                    </p>
                  )}

                  {/* Progress bar */}
                  {totalCount > 0 && (
                    <div className="mb-3">
                      <div className="h-1.5 rounded-full bg-tint-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                          style={
                            colors.hex
                              ? {
                                  width: `${progress}%`,
                                  backgroundColor: colors.hex,
                                  opacity: 0.75,
                                }
                              : { width: `${progress}%` }
                          }
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-text-faint tabular-nums">
                        {completedCount}/{totalCount} tasks ·{" "}
                        {Math.round(progress)}%
                      </p>
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {project.deadline && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] ${
                          isOverdue
                            ? "text-rose-400"
                            : isDueToday
                              ? "text-amber-400"
                              : "text-text-faint"
                        }`}
                      >
                        <CalendarDays size={10} />
                        {format(parseISO(project.deadline), "MMM d")}
                        {isOverdue && " · Overdue"}
                        {isDueToday && " · Today"}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-faint">
                      <ListTodo size={10} />
                      {totalCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-faint">
                      <StickyNote size={10} />
                      {project.noteIds.length}
                    </span>
                    {completedCount === totalCount && totalCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/70">
                        <CheckCircle2 size={10} />
                        Done
                      </span>
                    )}
                  </div>
                </Card>
              );
            },
          )}
        </div>
      )}

      {/* Modals */}
      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (data, starterTasks?: AiTaskDraft[]) => {
          const project = await projectsApi.createProject(data);
          if (starterTasks && starterTasks.length > 0) {
            for (const draft of starterTasks) {
              const taskId = await tasksApi.createTask({
                title: draft.title,
                description: draft.description || undefined,
                priority: draft.priority,
              });
              if (taskId) {
                if (draft.subTasks.length > 0) {
                  await tasksApi.saveSubTasks(
                    taskId,
                    draft.subTasks.map((t) => ({ title: t })),
                    [],
                  );
                }
                projectsApi.linkTask(project.id, taskId);
              }
            }
            toast.success(
              `Project created with ${starterTasks.length} starter task${starterTasks.length !== 1 ? "s" : ""}`,
            );
          } else {
            toast.success("Project created");
          }
        }}
      />

      <EditProjectModal
        project={editProject}
        onClose={() => setEditProject(null)}
        onSave={(id, data) => {
          projectsApi.updateProject(id, data);
          toast.success("Project updated");
        }}
      />

      <ProjectDetailModal
        project={detailProject}
        allTasks={tasksApi.activeTasks}
        allNotes={notesApi.notes}
        projectsApi={projectsApi}
        onClose={() => setDetailProject(null)}
      />

      <ConfirmModal
        open={!!deleteId}
        title="Delete project"
        message="This will permanently delete the project. Linked tasks and notes will not be affected."
        confirmLabel="Delete"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}
