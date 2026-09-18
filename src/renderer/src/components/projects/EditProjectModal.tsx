import { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { DatePicker } from "../ui/DatePicker";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";
import { Button } from "../ui/Button";
import { ColorPicker } from "./ColorPicker";
import type { Project, ProjectColor } from "../../types/orbit";
import type { CreateProjectData } from "../../hooks/useProjects";

interface EditProjectModalProps {
  project: Project | null;
  onClose: () => void;
  onSave: (id: string, data: Partial<CreateProjectData>) => void;
}

export function EditProjectModal({
  project,
  onClose,
  onSave,
}: EditProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColor>("violet");
  const [deadline, setDeadline] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description);
      setColor(project.color);
      setDeadline(project.deadline ?? "");
    }
  }, [project]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !name.trim()) return;
    onSave(project.id, {
      name,
      description,
      color,
      deadline: deadline || null,
    });
    onClose();
  }

  return (
    <Modal open={!!project} onClose={onClose} title="Edit project">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            Project name
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Website Redesign"
            maxLength={80}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            Description{" "}
            <span className="text-text-faint font-normal">(optional)</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about?"
            rows={2}
            maxLength={300}
          />
        </div>

        {/* Deadline */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            Deadline{" "}
            <span className="text-text-faint font-normal">(optional)</span>
          </label>
          <DatePicker value={deadline} onChange={setDeadline} />
        </div>

        {/* Color */}
        <ColorPicker
          value={color}
          onChange={setColor}
          projectName={name}
          projectDescription={description}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
