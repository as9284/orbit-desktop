import { useState } from "react";
import { Sparkles, LoaderCircle, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { DatePicker } from "../ui/DatePicker";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";
import { Button } from "../ui/Button";
import { ColorPicker } from "./ColorPicker";
import type { ProjectColor } from "../../types/orbit";
import type { CreateProjectData } from "../../hooks/useProjects";
import {
  generateProjectStarterPlan,
  type AiTaskDraft,
} from "../../lib/ai-client";
import { isFeatureReady } from "../../lib/ai";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateProjectData, starterTasks?: AiTaskDraft[]) => void;
}

export function CreateProjectModal({
  open,
  onClose,
  onCreate,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColor>("violet");
  const [deadline, setDeadline] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [starterTasks, setStarterTasks] = useState<AiTaskDraft[]>([]);

  const aiReady = isFeatureReady("lunaChat");

  function handleClose() {
    setName("");
    setDescription("");
    setColor("violet");
    setDeadline("");
    setStarterTasks([]);
    setGeneratingPlan(false);
    onClose();
  }

  async function handleGeneratePlan() {
    if (!name.trim()) return;
    setGeneratingPlan(true);
    const result = await generateProjectStarterPlan(name, description);
    setGeneratingPlan(false);
    if (result.tasks.length > 0) {
      setStarterTasks(result.tasks);
    }
  }

  function removeStarterTask(index: number) {
    setStarterTasks((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(
      {
        name,
        description,
        color,
        deadline: deadline || null,
      },
      starterTasks.length > 0 ? starterTasks : undefined,
    );
    handleClose();
  }

  const PRIORITY_COLORS: Record<string, string> = {
    high: "text-rose-400",
    medium: "text-amber-400",
    low: "text-blue-400",
  };

  return (
    <Modal open={open} onClose={handleClose} title="New project">
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
            autoFocus
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

        {/* AI Starter Plan */}
        {aiReady && (
          <div>
            {starterTasks.length === 0 ? (
              <button
                type="button"
                onClick={handleGeneratePlan}
                disabled={!name.trim() || generatingPlan}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-sm border border-dashed border-accent/30 text-accent-text/70 hover:text-accent-text hover:border-accent/50 hover:bg-accent/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {generatingPlan ? (
                  <>
                    <LoaderCircle size={13} className="animate-spin shrink-0" />
                    Generating starter plan…
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="shrink-0" />
                    Generate starter plan with Luna
                  </>
                )}
              </button>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-faint">
                    Starter tasks
                  </span>
                  <button
                    type="button"
                    onClick={handleGeneratePlan}
                    disabled={generatingPlan}
                    className="flex items-center gap-1 text-[10px] text-accent-text/60 hover:text-accent-text transition-colors disabled:opacity-40"
                  >
                    {generatingPlan ? (
                      <LoaderCircle size={10} className="animate-spin" />
                    ) : (
                      <Sparkles size={10} />
                    )}
                    Regenerate
                  </button>
                </div>
                <div className="space-y-1.5">
                  {starterTasks.map((task, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-3 py-2 glass rounded-lg group"
                    >
                      <span
                        className={`text-[10px] font-bold uppercase mt-0.5 shrink-0 w-10 ${PRIORITY_COLORS[task.priority] ?? "text-text-faint"}`}
                      >
                        {task.priority}
                      </span>
                      <span className="flex-1 text-sm text-text-secondary min-w-0 break-words">
                        {task.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeStarterTask(i)}
                        className="p-0.5 rounded text-text-faint hover:text-danger hover:bg-danger/10 transition-colors shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label={`Remove "${task.title}"`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
