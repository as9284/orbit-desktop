import {
  getFastestReasoningEffort,
  mapCodexModel,
  resolveModelSelection,
  type ModelConfig,
} from "./ai-models";

const STORAGE_KEY = "orbit:ai:settings";
const MODEL_CACHE_KEY = "orbit:ai:models";

export type { ModelConfig } from "./ai-models";

export interface AiFeatures {
  autoCategorize: boolean;
  noteTools: boolean;
  lunaChat: boolean;
  meetingMode: boolean;
  writingAssistant: boolean;
}

const DEFAULT_FEATURES: AiFeatures = {
  autoCategorize: true,
  noteTools: true,
  lunaChat: true,
  meetingMode: true,
  writingAssistant: true,
};

export interface AiSettings {
  model: string;
  effort: string;
  features: AiFeatures;
}

function defaults(): AiSettings {
  return {
    model: "",
    effort: "",
    features: { ...DEFAULT_FEATURES },
  };
}

function readModelCache(): ModelConfig[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MODEL_CACHE_KEY) ?? "[]") as ModelConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeModelCache(models: ModelConfig[]): void {
  localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(models));
}

export function getAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<AiSettings> & {
      features?: Partial<AiFeatures>;
    };
    return {
      model: typeof parsed.model === "string" ? parsed.model : "",
      effort: typeof parsed.effort === "string" ? parsed.effort : "",
      features: { ...DEFAULT_FEATURES, ...parsed.features },
    };
  } catch {
    return defaults();
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("orbit:ai:changed"));
}

export function getActiveApiKey(): string {
  return hasApiKey() ? "local-codex" : "";
}

export function getActiveModel(): string {
  return getAiSettings().model;
}

export function getActiveEffort(): string {
  const settings = getAiSettings();
  if (settings.effort) return settings.effort;
  const model = readModelCache().find((candidate) => candidate.id === settings.model);
  return model?.defaultReasoningEffort ?? "medium";
}

export function getFastestActiveEffort(): string {
  const settings = getAiSettings();
  const model = readModelCache().find((candidate) => candidate.id === settings.model);
  return getFastestReasoningEffort(model) ?? getActiveEffort();
}

export function getActiveBaseUrl(): string {
  return "";
}

export function hasApiKey(): boolean {
  return Boolean(getActiveModel());
}

export function getFeatures(): AiFeatures {
  return getAiSettings().features;
}

export function isFeatureReady(feature: keyof AiFeatures): boolean {
  const settings = getAiSettings();
  return Boolean(settings.model) && settings.features[feature];
}

export function activeModelSupportsThinking(): boolean {
  const settings = getAiSettings();
  const model = readModelCache().find((candidate) => candidate.id === settings.model);
  return (model?.supportedReasoningEfforts.length ?? 0) > 1;
}

export function modelUsesMessagesEndpoint(): boolean {
  return false;
}

export function isReasoningModel(): boolean {
  return true;
}

export function isRecommendedModel(model: ModelConfig): boolean {
  return model.recommended === true;
}

export function pickDefaultModel(models: ModelConfig[]): string {
  return models.find((model) => model.recommended)?.id ?? models[0]?.id ?? "";
}

export async function fetchOpenCodeGoModels(): Promise<{
  models: ModelConfig[];
  error: string | null;
}> {
  try {
    const models = (await window.orbitDesktop.codex.models()).map(mapCodexModel);
    writeModelCache(models);
    return { models, error: null };
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getChatEndpoint(model?: string): string {
  void model;
  return "";
}

export async function initializeCodexSettings(): Promise<void> {
  const result = await fetchOpenCodeGoModels();
  if (result.error || result.models.length === 0) return;
  const current = getAiSettings();
  const resolved = resolveModelSelection(result.models, current.model, current.effort);
  if (current.model !== resolved.model || current.effort !== resolved.effort) {
    saveAiSettings({ ...current, ...resolved });
  }
}
