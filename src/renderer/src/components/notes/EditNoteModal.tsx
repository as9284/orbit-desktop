import { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { RichTextEditor } from "../ui/RichTextEditor";
import type { Note } from "../../types/orbit";

interface Props {
  open: boolean;
  note: Note | null;
  onClose: () => void;
  onSave: (id: string, title: string, content: string) => Promise<boolean>;
}

export function EditNoteModal({ open, note, onClose, onSave }: Props) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [titleError, setTitleError] = useState("");
  const [loading, setLoading] = useState(false);

  // Sync form state whenever a different note is selected for editing.
  // Guarded by `if (note)` so form content persists during the exit animation
  // (when note becomes null but the modal is still animating out).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content ?? "");
      setTitleError("");
    }
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note) return;
    if (!title.trim()) {
      setTitleError("Note title is required");
      return;
    }
    if (title.trim().length > 200) {
      setTitleError("Title cannot exceed 200 characters");
      return;
    }
    setLoading(true);
    const ok = await onSave(note.id, title, content);
    setLoading(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit note">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4 sm:space-y-5"
      >
        <div>
          <Input
            variant="bare"
            type="text"
            autoFocus
            placeholder="Note title"
            value={title}
            maxLength={200}
            hasError={!!titleError}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError("");
            }}
          />
          {titleError && (
            <p className="mt-1.5 text-[11px] text-danger">{titleError}</p>
          )}
        </div>
        <div>
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="Write your note…"
            maxLength={10000}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
