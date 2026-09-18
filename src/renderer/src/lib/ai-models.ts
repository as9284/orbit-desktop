import type { CodexModel } from "../../../shared/contracts";

export interface ModelConfig {
  id: string;
  label: string;
  description: string;
  supportedReasoningEfforts: Array<{
    reasoningEffort: string;
    description: string;
  }>;
  defaultReasoningEffort: string;
  recommended?: boolean;
  supportsThinking?: boolean;
  endpoint?: "chat" | "messages";
  reasoning?: boolean;
}

const REASONING_EFFORT_ORDER = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

export function mapCodexModel(model: CodexModel): ModelConfig {
  return {
    id: model.id,
    label: model.displayName,
    description: model.description,
    supportedReasoningEfforts: model.supportedReasoningEfforts.filter(
      (option) => option.reasoningEffort !== "ultra",
    ),
    defaultReasoningEffort: model.defaultReasoningEffort,
    recommended: model.isDefault,
    supportsThinking: model.supportedReasoningEfforts.length > 1,
    reasoning: true,
    endpoint: "chat",
  };
}

/**
 * Orbit's own preferred default, which deliberately overrides whichever model
 * Codex marks `isDefault` (currently gpt-6-astra). A saved user choice still
 * wins, and if this id is not in the live catalog the Codex default is used.
 */
export const ORBIT_DEFAULT_MODEL_ID = "gpt-5.6-luna";

export function resolveModelSelection(
  models: ModelConfig[],
  currentModel: string,
  currentEffort: string,
): { model: string; effort: string } {
  const selected = models.find((model) => model.id === currentModel)
    ?? models.find((model) => model.id === ORBIT_DEFAULT_MODEL_ID)
    ?? models.find((model) => model.recommended)
    ?? models[0];

  if (!selected) return { model: "", effort: "" };

  const efforts = selected.supportedReasoningEfforts.map(
    (option) => option.reasoningEffort,
  );
  const effort = efforts.includes(currentEffort)
    ? currentEffort
    : efforts.includes(selected.defaultReasoningEffort)
      ? selected.defaultReasoningEffort
      : efforts[0] ?? "medium";

  return { model: selected.id, effort };
}

export function getFastestReasoningEffort(model: ModelConfig | undefined): string | null {
  if (!model) return null;
  const supported = new Set(
    model.supportedReasoningEfforts.map((option) => option.reasoningEffort),
  );
  return REASONING_EFFORT_ORDER.find((effort) => supported.has(effort))
    ?? model.supportedReasoningEfforts[0]?.reasoningEffort
    ?? null;
}
