import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { RichTextEditor } from "../ui/RichTextEditor";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, content: string) => Promise<boolean>;
}

export function CreateNoteModal({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [titleError, setTitleError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setTitle("");
    setContent("");
    setTitleError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Note title is required");
      return;
    }
    if (title.trim().length > 200) {
      setTitleError("Title cannot exceed 200 characters");
      return;
    }
    setLoading(true);
    const ok = await onCreate(title, content);
    setLoading(false);
    if (ok) handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="New note">
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
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Create note
          </Button>
        </div>
      </form>
    </Modal>
  );
}
