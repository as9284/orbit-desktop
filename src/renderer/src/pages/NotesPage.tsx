import { useEffect, useState, useMemo, useCallback } from "react";
import { orbitNotify as toast } from "../lib/notify";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  StickyNote,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useNotesApi, useTasksApi } from "../components/layout/AppLayout";
import { Spinner } from "../components/ui/Spinner";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { CreateNoteModal } from "../components/notes/CreateNoteModal";
import { EditNoteModal } from "../components/notes/EditNoteModal";
import { NotePreviewModal } from "../components/notes/NotePreviewModal";
import { NoteSummaryModal } from "../components/notes/NoteSummaryModal";
import { stripMarkdown } from "../lib/markdown";
import { isFeatureReady } from "../lib/ai";
import {
  convertNoteToTaskDraft,
  summarizeNote,
  type AiNoteSummary,
} from "../lib/ai-client";
import type { Note } from "../types/orbit";

export function NotesPage() {
  const api = useNotesApi();
  const tasksApi = useTasksApi();
  const [createOpen, setCreateOpen] = useState(false);
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [previewNote, setPreviewNote] = useState<Note | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [convertingNoteId, setConvertingNoteId] = useState<string | null>(null);
  const [summarizingNoteId, setSummarizingNoteId] = useState<string | null>(
    null,
  );
  const [postConvertNote, setPostConvertNote] = useState<Note | null>(null);
  const [summaryNote, setSummaryNote] = useState<Note | null>(null);
  const [activeSummary, setActiveSummary] = useState<AiNoteSummary | null>(
    null,
  );

  // Re-render when AI settings change so feature checks update immediately
  const [, setAiTick] = useState(0);
  useEffect(() => {
    const handler = () => setAiTick((t) => t + 1);
    window.addEventListener("orbit:ai:changed", handler);
    return () => window.removeEventListener("orbit:ai:changed", handler);
  }, []);

  useEffect(() => {
    void api.fetchNotes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedBackgroundCategorize = useDebouncedCallback(() => {
    if (api.notes.length > 0) {
      void api.backgroundCategorize(api.notes);
    }
  }, 2500);

  useEffect(() => {
    debouncedBackgroundCategorize();
  }, [api.notes.length, debouncedBackgroundCategorize]);

  // Keyboard shortcut: N to create new note
  const openCreate = useCallback(() => setCreateOpen(true), []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !createOpen &&
        !editNote &&
        !previewNote
      ) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        openCreate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreate, createOpen, editNote, previewNote]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const note of api.notes) {
      const cat = api.categories[note.id];
      if (cat) cats.add(cat);
    }
    return [...cats].sort();
  }, [api.notes, api.categories]);

  const filtered = useMemo(() => {
    let result = search.trim()
      ? api.notes.filter(
          (n) =>
            n.title.toLowerCase().includes(search.toLowerCase()) ||
            n.content?.toLowerCase().includes(search.toLowerCase()),
        )
      : api.notes;
    if (categoryFilter) {
      result = result.filter((n) => api.categories[n.id] === categoryFilter);
    }
    return result;
  }, [api.notes, api.categories, search, categoryFilter]);

  const handleCreate = async (title: string, content: string) => {
    const id = await api.createNote({
      title,
      content: content || undefined,
    });
    if (id) toast.success("Note created");
    else toast.error("Failed to create note");
    return !!id;
  };

  const handleSave = async (id: string, title: string, content: string) => {
    const ok = await api.updateNote(id, {
      title,
      content: content || undefined,
    });
    if (ok) toast.success("Note updated");
    else toast.error("Failed to update note");
    return ok;
  };

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await api.deleteNote(id);
      if (ok) toast.success("Note deleted");
      else toast.error("Failed to delete note");
      setDeleteId(null);
    },
    [api],
  );

  const closePreview = useCallback(() => {
    setPreviewNote(null);
    setSummaryNote(null);
    setActiveSummary(null);
  }, []);

  const handleConvertToTask = useCallback(
    async (note: Note) => {
      if (!isFeatureReady("noteTools")) {
        toast.error("Enable Note AI features in Settings → Luna first");
        return;
      }

      setConvertingNoteId(note.id);
      try {
        const result = await convertNoteToTaskDraft(note.title, note.content);

        if (!result.draft) {
          toast.error(result.error || "Luna couldn't convert this note");
          return;
        }

        const taskId = await tasksApi.createTask({
          title: result.draft.title,
          description: result.draft.description || undefined,
          priority: result.draft.priority,
        });

        if (!taskId) {
          toast.error("Task creation failed after Luna conversion");
          return;
        }

        if (result.draft.subTasks.length > 0) {
          const saved = await tasksApi.saveSubTasks(
            taskId,
            result.draft.subTasks.map((title) => ({ title })),
            [],
          );
          if (!saved) {
            toast.error("Task created, but sub-tasks could not be saved");
            return;
          }
        }

        const categoryResult = await tasksApi.categorizeSingleTask({
          taskId,
          title: result.draft.title,
          description: result.draft.description,
        });

        if (categoryResult.error) {
          toast.error(
            `Task created, but categorization failed: ${categoryResult.error}`,
          );
        }

        toast.success(
          categoryResult.category
            ? `Task created with Luna in ${categoryResult.category}`
            : result.model
              ? `Task created with Luna via ${result.model}`
              : "Task created with Luna",
        );
        setPostConvertNote(note);
      } finally {
        setConvertingNoteId(null);
      }
    },
    [tasksApi],
  );

  const handleSummarizeNote = useCallback(async (note: Note) => {
    if (!isFeatureReady("noteTools")) {
      toast.error("Enable Note AI features in Settings → Luna first");
      return;
    }

    setSummarizingNoteId(note.id);
    try {
      const result = await summarizeNote(note.title, note.content);

      if (!result.summary) {
        toast.error(result.error || "Luna couldn't summarize this note");
        return;
      }

      setSummaryNote(note);
      setActiveSummary(result.summary);

      toast.success(
        result.model
          ? `Summary ready via ${result.model}`
          : "Summary ready with Luna",
      );
    } finally {
      setSummarizingNoteId(null);
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10 animate-fade-in">
      {/* Page header */}
      <PageHeader
        className="mb-8 sm:mb-10"
        title="Notes"
        subtitle={`${api.notes.length} note${api.notes.length !== 1 ? "s" : ""}`}
        action={
          <Button
            variant="primary"
            onClick={openCreate}
            className="w-full px-5 sm:w-auto"
          >
            <Plus size={16} strokeWidth={2.5} />
            New note
            <kbd className="ml-1 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/60 sm:inline">
              N
            </kbd>
          </Button>
        }
      />

      {/* Search */}
      {api.notes.length > 0 && (
        <div
          className="mb-4 animate-fade-in"
          style={{ animationDelay: "50ms" }}
        >
          <input
            type="text"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-tint-1 border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-faint outline-none focus:border-accent/35 transition-colors"
          />
        </div>
      )}

      {/* Category filter chips */}
      {isFeatureReady("autoCategorize") &&
        (uniqueCategories.length > 0 || api.isCategorizingBackground) && (
          <div
            className="flex items-center gap-2 flex-wrap mb-6 animate-fade-in"
            style={{ animationDelay: "80ms" }}
          >
            <span className="flex items-center gap-1 text-[10px] text-text-faint font-semibold uppercase tracking-widest shrink-0">
              <Tag size={10} />
              Category
              {api.isCategorizingBackground && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
              )}
            </span>
            {uniqueCategories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setCategoryFilter(cat === categoryFilter ? null : cat)
                }
                className={`px-2.5 py-1.5 sm:py-1 min-h-9 sm:min-h-0 rounded-lg text-xs font-medium transition-all duration-200 border break-words ${
                  categoryFilter === cat
                    ? "bg-accent-muted text-accent-text border-accent/30"
                    : "bg-tint-1 text-text-muted border-border-default hover:text-text-secondary hover:bg-tint-2 hover:border-border-strong"
                }`}
              >
                {cat}
              </button>
            ))}
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter(null)}
                className="flex items-center gap-1 text-[11px] text-text-faint hover:text-text-muted transition-colors"
                aria-label="Clear category filter"
              >
                <X size={10} />
                Clear
              </button>
            )}
            {!api.isCategorizingBackground &&
              isFeatureReady("autoCategorize") &&
              api.notes.some((n) => !api.categories[n.id]) && (
                <button
                  onClick={() => void api.backgroundCategorize(api.notes)}
                  className="ml-auto flex items-center gap-1 text-[11px] text-text-faint hover:text-accent-text transition-colors"
                  title="Categorise remaining notes"
                >
                  <Sparkles size={11} />
                  Categorise
                </button>
              )}
          </div>
        )}

      {api.aiStatus && !api.aiStatus.startsWith("Luna via ") && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3 py-2 text-xs text-amber-200/80">
          {api.aiStatus}
        </div>
      )}

      {/* Notes grid */}
      {api.loading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size={24} className="text-text-faint" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          float
          icon={<StickyNote size={22} className="text-accent/40" />}
          title={
            search
              ? "No notes match your search"
              : "No notes yet. Create your first one."
          }
          action={
            !search && (
              <Button variant="secondary" className="px-5" onClick={openCreate}>
                <Plus size={15} />
                Create your first note
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((note, i) => (
            <div
              key={note.id}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(i * 40, 400) + 120}ms` }}
            >
              <NoteCard
                note={note}
                category={api.categories[note.id] ?? null}
                converting={convertingNoteId === note.id}
                aiEnabled={isFeatureReady("noteTools")}
                onEdit={setEditNote}
                onPreview={setPreviewNote}
                onDelete={(id) => setDeleteId(id)}
                onConvert={handleConvertToTask}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateNoteModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <EditNoteModal
        open={!!editNote}
        note={editNote}
        onClose={() => setEditNote(null)}
        onSave={handleSave}
      />
      <NotePreviewModal
        note={previewNote}
        converting={previewNote?.id === convertingNoteId}
        summarizing={previewNote?.id === summarizingNoteId}
        summaryOpen={!!summaryNote && !!activeSummary}
        aiEnabled={isFeatureReady("noteTools")}
        onClose={closePreview}
        onEdit={(n) => {
          closePreview();
          setEditNote(n);
        }}
        onConvert={handleConvertToTask}
        onSummarize={handleSummarizeNote}
      />
      <NoteSummaryModal
        open={!!summaryNote && !!activeSummary}
        note={summaryNote}
        summary={activeSummary}
        onClose={() => {
          setSummaryNote(null);
          setActiveSummary(null);
        }}
      />
      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete note"
        message="Permanently delete this note? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteId && handleDelete(deleteId)}
      />
      <ConfirmModal
        open={!!postConvertNote}
        onClose={() => setPostConvertNote(null)}
        title="Delete original note?"
        message="The task was created successfully. Delete the original note now, or keep it for reference? Note archiving is not available yet."
        confirmLabel="Delete note"
        onConfirm={() => {
          if (!postConvertNote) return;
          if (previewNote?.id === postConvertNote.id) {
            setPreviewNote(null);
          }
          void handleDelete(postConvertNote.id);
          setPostConvertNote(null);
        }}
      />
    </div>
  );
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  category,
  converting,
  aiEnabled,
  onEdit,
  onPreview,
  onDelete,
  onConvert,
}: {
  note: Note;
  category: string | null;
  converting: boolean;
  aiEnabled: boolean;
  onEdit: (note: Note) => void;
  onPreview: (note: Note) => void;
  onDelete: (id: string) => void;
  onConvert: (note: Note) => void;
}) {
  return (
    <Card
      interactive
      className="group relative p-4 cursor-pointer"
      onClick={() => onPreview(note)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview(note);
        }
      }}
    >
      <div className="flex items-start gap-3 mb-2 min-w-0">
        <FileText size={14} className="text-accent-text/50 shrink-0 mt-0.5" />
        <h3 className="text-sm font-semibold text-text-primary line-clamp-1 flex-1 min-w-0 break-words">
          {note.title}
        </h3>
      </div>
      {note.content && (
        <p className="text-xs text-text-faint line-clamp-3 leading-relaxed mb-3 ml-6.5 break-words">
          {stripMarkdown(note.content)}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 ml-6.5">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-[10px] text-text-faint">
            {format(parseISO(note.updated_at), "MMM d, yyyy")}
          </span>
          {category && aiEnabled && (
            <span className="max-w-full rounded px-1.5 py-px text-[9px] font-medium bg-accent-muted text-accent-text/80 border border-accent/15 break-words">
              {category}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {aiEnabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConvert(note);
              }}
              disabled={converting}
              className="p-1.5 rounded-lg text-cyan-300/45 hover:text-cyan-200 hover:bg-cyan-500/10 transition-all disabled:opacity-60 disabled:cursor-wait"
              aria-label="Convert note to task with Luna"
            >
              {converting ? <Spinner size={12} /> : <Sparkles size={12} />}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(note);
            }}
            className="p-1.5 rounded-lg text-text-faint hover:text-text-secondary hover:bg-tint-3 transition-all"
            aria-label="Edit note"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
            className="p-1.5 rounded-lg text-text-faint hover:text-danger hover:bg-danger/8 transition-all"
            aria-label="Delete note"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </Card>
  );
}
