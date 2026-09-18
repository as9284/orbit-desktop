import { useState } from "react";
import { FileText, ListTodo, Pencil, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { Button } from "../ui/Button";
import { renderMarkdown } from "../../lib/markdown";
import type { Note } from "../../types/orbit";

interface Props {
  note: Note | null;
  converting: boolean;
  summarizing: boolean;
  summaryOpen: boolean;
  aiEnabled: boolean;
  onClose: () => void;
  onEdit: (note: Note) => void;
  onConvert: (note: Note) => void;
  onSummarize: (note: Note) => void;
}

export function NotePreviewModal({
  note,
  converting,
  summarizing,
  summaryOpen,
  aiEnabled,
  onClose,
  onEdit,
  onConvert,
  onSummarize,
}: Props) {
  // Keep a snapshot so content stays visible during the exit animation
  // (when note becomes null, displayNote still holds the last note).
  const [displayNote, setDisplayNote] = useState<Note | null>(note);
  if (note && note !== displayNote) {
    setDisplayNote(note);
  }

  const allActionButtons = [
    {
      key: "summarize",
      label: "Summary",
      hint: "Generate a concise AI summary",
      busy: summarizing,
      icon: Sparkles,
      className:
        "border-cyan-300/18 bg-cyan-500/6 text-cyan-50 hover:bg-cyan-500/12 hover:border-cyan-200/35",
      onClick: () => displayNote && onSummarize(displayNote),
    },
    {
      key: "convert",
      label: "Task",
      hint: "Turn this note into a task draft",
      busy: converting,
      icon: ListTodo,
      className:
        "border-accent/20 bg-accent/8 text-violet-50 hover:bg-accent-muted hover:border-accent/35",
      onClick: () => displayNote && onConvert(displayNote),
    },
  ];
  const actionButtons = aiEnabled ? allActionButtons : [];

  return (
    <Modal
      open={!!note}
      onClose={onClose}
      title="Note"
      maxWidth="max-w-xl"
      closeOnEscape={!summaryOpen}
      closeOnOverlayClick={!summaryOpen}
    >
      {displayNote && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <FileText
                size={18}
                className="text-accent-text/50 shrink-0 mt-0.5"
              />
              <h3 className="text-lg font-semibold text-text-primary leading-snug flex-1 min-w-0 break-words">
                {displayNote.title}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2 shrink-0">
              {actionButtons.map((action) => (
                <div key={action.key} className="group relative">
                  <button
                    type="button"
                    disabled={action.busy}
                    onClick={action.onClick}
                    aria-label={action.hint}
                    title={action.hint}
                    className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full border px-3 py-2 sm:py-1.5 text-[11px] font-semibold transition-all duration-150 disabled:opacity-60 disabled:cursor-wait focus-ring ${action.className}`}
                  >
                    {action.busy ? (
                      <Spinner size={11} />
                    ) : (
                      <action.icon size={12} />
                    )}
                    <span>{action.label}</span>
                  </button>
                  <span className="pointer-events-none absolute top-[calc(100%+8px)] right-0 hidden sm:block glass-raised rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-text-primary opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-150 z-10">
                    {action.hint}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {displayNote.content && (
            <div className="glass rounded-xl px-4 py-3 text-sm text-text-secondary leading-relaxed space-y-1.5 min-w-0 break-words">
              {renderMarkdown(displayNote.content)}
            </div>
          )}

          <div className="pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 text-[11px] text-text-faint">
            <span>
              Created{" "}
              {format(
                parseISO(displayNote.created_at),
                "MMM d, yyyy 'at' h:mm a",
              )}
            </span>
            <span>
              Updated{" "}
              {format(
                parseISO(displayNote.updated_at),
                "MMM d, yyyy 'at' h:mm a",
              )}
            </span>
          </div>

          <div className="grid gap-2.5 pt-1 sm:grid-cols-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                onClose();
                onEdit(displayNote);
              }}
            >
              <Pencil size={13} />
              Edit note
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
