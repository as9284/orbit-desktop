import { useState } from "react";
import { Check, Sparkles, LoaderCircle } from "lucide-react";
import { orbitNotify as toast } from "../../lib/notify";
import type { ProjectColor } from "../../types/orbit";
import { hasApiKey } from "../../lib/ai";
import { generateProjectColor } from "../../lib/ai-client";
import { PROJECT_COLOR_OPTIONS } from "./projectColorOptions";

interface ColorPickerProps {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  projectName?: string;
  projectDescription?: string;
}

export function ColorPicker({
  value,
  onChange,
  projectName = "",
  projectDescription = "",
}: ColorPickerProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiColor, setAiColor] = useState<string | null>(null);
  const aiEnabled = hasApiKey();

  async function handleGenerate() {
    if (!projectName.trim()) return;
    setAiLoading(true);
    const result = await generateProjectColor(projectName, projectDescription);
    setAiLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else if (result.color) {
      setAiColor(result.color);
      onChange(result.color);
    }
  }

  const selectedNamed = PROJECT_COLOR_OPTIONS.find((c) => c.value === value);
  const isAiSelected = value.startsWith("#");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-muted">Color</label>
        {aiEnabled && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={aiLoading || !projectName.trim()}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-text/70 hover:text-accent-text disabled:opacity-40 transition-colors"
          >
            {aiLoading ? (
              <LoaderCircle size={10} className="animate-spin" />
            ) : (
              <Sparkles size={10} />
            )}
            {aiLoading ? "Generating." : "Generate with Luna"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
        {PROJECT_COLOR_OPTIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.value)}
            className={`relative w-8 h-8 rounded-full transition-all duration-150 ${c.bg} ${
              value === c.value
                ? `ring-2 ${c.ring} ring-offset-2 ring-offset-surface-1 scale-105`
                : "hover:scale-110 hover:brightness-110"
            }`}
          >
            {value === c.value && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Check
                  size={11}
                  className="text-white drop-shadow"
                  strokeWidth={3}
                />
              </span>
            )}
          </button>
        ))}
      </div>

      {selectedNamed && !isAiSelected && (
        <p className="text-[11px] text-text-faint">{selectedNamed.label}</p>
      )}

      {aiColor && (
        <button
          type="button"
          onClick={() => onChange(aiColor)}
          className="w-full flex items-center gap-3 glass glass-interactive rounded-xl px-3 py-2.5 text-left transition-all duration-150"
        >
          <span
            className={`w-6 h-6 rounded-full shrink-0 transition-all ${isAiSelected ? "ring-2 ring-border-strong ring-offset-1 ring-offset-surface-3 scale-110" : ""}`}
            style={{ backgroundColor: aiColor }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Sparkles size={10} className="text-accent-text/70 shrink-0" />
              <span className="text-[11px] font-medium text-text-muted">
                AI Generated
              </span>
            </div>
            <p className="text-[10px] text-text-faint font-mono mt-0.5 tracking-wide">
              {aiColor}
            </p>
          </div>
          {isAiSelected && (
            <Check
              size={13}
              className="text-text-muted shrink-0"
              strokeWidth={2.5}
            />
          )}
        </button>
      )}
    </div>
  );
}
