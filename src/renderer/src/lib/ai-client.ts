import {
  getActiveApiKey,
  getActiveEffort,
  getFastestActiveEffort,
  getActiveModel,
  getChatEndpoint,
} from "./ai";
import { aiQueue, type AiRunOptions } from "./ai-queue";
import { fetchWithRetry } from "./fetch-retry";
import { runCodexCompletion } from "./codex-client";
import {
  buildCategorizationRequest,
  chunkCategoryInputs,
  parseCategorizationResponse,
  type CategoryAssignment,
  type CategoryInput,
  type CategoryKind,
} from "./category-taxonomy";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CategorizeTaskResult {
  category: string | null;
  model: string | null;
  error: string | null;
}

export interface CategorizeBatchResult {
  assignments: CategoryAssignment[];
  model: string | null;
  error: string | null;
}

export interface ProjectStarterPlanResult {
  tasks: AiTaskDraft[];
  model: string | null;
  error: string | null;
}

export interface SuggestSubTasksResult {
  subTasks: string[];
  model: string | null;
  error: string | null;
}

export interface GenerateMeetingAgendaResult {
  agenda: string | null;
  model: string | null;
  error: string | null;
}

export interface AiTaskDraft {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  subTasks: string[];
}

export interface ConvertNoteToTaskResult {
  draft: AiTaskDraft | null;
  model: string | null;
  error: string | null;
}

export interface AiNoteSummary {
  headline: string;
  summary: string;
  keyPoints: string[];
  nextSteps: string[];
}

export interface SummarizeNoteResult {
  summary: AiNoteSummary | null;
  model: string | null;
  error: string | null;
}

export interface MeetingNoteDraft {
  title: string;
  content: string;
}

export interface MeetingArtifactsDraft {
  note: MeetingNoteDraft;
  task: AiTaskDraft;
}

export interface GenerateMeetingArtifactsResult {
  artifacts: MeetingArtifactsDraft | null;
  model: string | null;
  error: string | null;
}

export type WritingMode =
  | "improve"
  | "grammar"
  | "rephrase"
  | "formal"
  | "casual"
  | "expand"
  | "shorten"
  | "bullets"
  | "continue"
  | "email";

export interface WritingResult {
  text: string | null;
  model: string | null;
  error: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CacheInfo {
  cacheHitTokens: number;
  cacheMissTokens: number;
}

type AiTextOptions = AiRunOptions & {
  reasoningMode?: "selected" | "fastest";
  outputSchema?: Record<string, unknown>;
};

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onReasoningToken?: (token: string) => void;
  onThinkingFallback?: () => void;
  onToolCall: (
    name: string,
    args: Record<string, unknown>,
  ) => string | Promise<string>;
  onDone: (fullText: string, reasoning?: string) => void;
  onError: (error: string) => void;
  onCacheInfo?: (info: CacheInfo) => void;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const b = block as { type?: string; text?: string };
      return b.type === "text" && typeof b.text === "string" ? b.text : "";
    })
    .join("");
}

function extractResponseText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;

  // OpenAI-style: choices[0].message.content  -  string or array of blocks.
  const message = (
    d.choices as Array<{ message?: { content?: unknown } }> | undefined
  )?.[0]?.message;
  const openAiContent = message?.content;
  if (typeof openAiContent === "string" && openAiContent.trim()) {
    return openAiContent.trim();
  }
  const openAiBlocks = blocksToText(openAiContent);
  if (openAiBlocks.trim()) return openAiBlocks.trim();

  // Anthropic-style: top-level content  -  string or array of blocks.
  if (typeof d.content === "string" && d.content.trim()) {
    return d.content.trim();
  }
  const anthropicText = blocksToText(d.content);
  if (anthropicText.trim()) return anthropicText.trim();

  return "";
}

async function executeToolCallsSequentially(
  entries: Array<{ id: string; name: string; arguments: string }>,
  onToolCall: StreamCallbacks["onToolCall"],
): Promise<Array<{ tc: (typeof entries)[number]; result: string }>> {
  const results: Array<{ tc: (typeof entries)[number]; result: string }> = [];
  for (const tc of entries) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.arguments) as Record<string, unknown>;
    } catch {
      /* use empty args */
    }
    const result = await Promise.resolve(onToolCall(tc.name, args));
    results.push({ tc, result });
  }
  return results;
}

function getRequestHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function getActiveModels(): string[] {
  const model = getActiveModel();
  return model ? [model] : [];
}

async function requestAiText(
  prompt: string,
  maxTokens = 300,
  queueOptions: AiTextOptions = {},
): Promise<{
  text: string | null;
  model: string | null;
  error: string | null;
}> {
  if (window.orbitDesktop) {
    const model = getActiveModel();
    if (!model) {
      return {
        text: null,
        model: null,
        error: "No Codex model selected. Choose one in Settings → Luna.",
      };
    }
    return aiQueue.run(
      {
        priority: queueOptions.priority ?? "user",
        label: queueOptions.label ?? "AI completion",
        dedupeKey: queueOptions.dedupeKey,
        signal: queueOptions.signal ?? aiQueue.getBackgroundAbortSignal(),
      },
      async () => {
        try {
          const result = await runCodexCompletion(
            {
              prompt,
              model,
              effort: queueOptions.reasoningMode === "fastest"
                ? getFastestActiveEffort()
                : getActiveEffort(),
              outputSchema: queueOptions.outputSchema,
            },
            {},
            queueOptions.signal,
          );
          return { text: result.text || null, model: result.model, error: null };
        } catch (error) {
          return {
            text: null,
            model,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );
  }

  const apiKey = getActiveApiKey();
  if (!apiKey)
    return {
      text: null,
      model: null,
      error: "No API key configured. Go to Settings → Luna.",
    };

  const headers = getRequestHeaders(apiKey);
  const models = getActiveModels();
  if (models.length === 0) {
    return {
      text: null,
      model: null,
      error: "No model selected. Choose a model in Settings → Luna.",
    };
  }

  return aiQueue.run(
    {
      priority: queueOptions.priority ?? "user",
      label: queueOptions.label ?? "AI completion",
      dedupeKey: queueOptions.dedupeKey,
      signal:
        queueOptions.signal ?? aiQueue.getBackgroundAbortSignal(),
    },
    async () => {
      let lastError: string | null = null;

      for (const model of models) {
        try {
          const body: Record<string, unknown> = {
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: Math.max(maxTokens, 4096),
            temperature: 0.2,
            stream: true,
          };

          const endpoint = getChatEndpoint(model);
          const res = await fetchWithRetry(
            endpoint,
            {
              method: "POST",
              headers,
              body: JSON.stringify(body),
            },
            {
              signal: queueOptions.signal,
              onRetry: ({ status, delayMs }) => {
                const seconds = Math.ceil(delayMs / 1000);
                aiQueue.setRetryMessage(
                  status === 429
                    ? `Rate limited  -  retrying in ${seconds}s…`
                    : `Upstream error  -  retrying in ${seconds}s…`,
                );
              },
            },
          ).finally(() => aiQueue.setRetryMessage(null));

          if (!res.ok) {
            const errText = await res.text();
            if (res.status === 400 && errText.includes("stream")) {
              const fbRes = await fetchWithRetry(
                endpoint,
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ ...body, stream: false }),
                },
                { signal: queueOptions.signal },
              );
              if (!fbRes.ok) {
                const fbErr = await fbRes.text();
                lastError = `${model} failed (${fbRes.status}): ${fbErr.slice(0, 180)}`;
                continue;
              }
              const data = await fbRes.json();
              const fbText = extractResponseText(data);
              const fbModel =
                data && typeof data === "object" && "model" in data
                  ? String((data as { model?: string }).model ?? model)
                  : model;
              if (fbText) return { text: fbText, model: fbModel, error: null };
              lastError = `${model} returned no usable text. Raw: ${JSON.stringify(data ?? {}).slice(0, 240)}`;
              continue;
            }
            lastError = `${model} failed (${res.status}): ${errText.slice(0, 180)}`;
            continue;
          }

          const reader = res.body?.getReader();
          if (!reader) {
            lastError = `${model} returned no response stream.`;
            continue;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let text = "";
          let modelUsed = model;
          let finishReason = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const payload = trimmed.slice(6);
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload) as {
                  model?: string;
                  choices?: {
                    delta?: { content?: string };
                    finish_reason?: string;
                  }[];
                };
                if (parsed.model) modelUsed = parsed.model;
                const choice = parsed.choices?.[0];
                if (choice?.delta?.content) text += choice.delta.content;
                if (choice?.finish_reason) finishReason = choice.finish_reason;
              } catch {
                // skip malformed SSE chunk
              }
            }
          }

          const finalText = text.trim();
          if (finalText) return { text: finalText, model: modelUsed, error: null };

          lastError =
            finishReason === "length"
              ? `${model} hit the token limit before producing an answer. If it is a reasoning model, pick a non-reasoning model in Settings → Luna.`
              : `${model} returned no usable text.`;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return {
              text: null,
              model: null,
              error: "Request cancelled.",
            };
          }
          lastError = `${model} request failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      return { text: null, model: null, error: lastError };
    },
  );
}

// ── Text helpers ─────────────────────────────────────────────────────────────

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function parseTaskDraft(text: string): AiTaskDraft | null {
  try {
    const parsed = JSON.parse(
      stripMarkdownCodeFence(text),
    ) as Partial<AiTaskDraft>;
    const title = parsed.title?.trim();
    if (!title) return null;
    const priority =
      parsed.priority === "low" ||
      parsed.priority === "medium" ||
      parsed.priority === "high"
        ? parsed.priority
        : "medium";
    const description = parsed.description?.trim() ?? "";
    const subTasks = Array.isArray(parsed.subTasks)
      ? parsed.subTasks
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    return { title, description, priority, subTasks };
  } catch {
    return null;
  }
}

function coerceStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseNoteSummary(text: string, title: string): AiNoteSummary | null {
  try {
    const parsed = JSON.parse(
      stripMarkdownCodeFence(text),
    ) as Partial<AiNoteSummary>;
    const headline = parsed.headline?.trim() || title.trim() || "Note summary";
    const summary = parsed.summary?.trim();
    if (!summary) return null;

    return {
      headline,
      summary,
      keyPoints: coerceStringList(parsed.keyPoints, 5),
      nextSteps: coerceStringList(parsed.nextSteps, 4),
    };
  } catch {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const bulletLines = lines
      .filter((line) => /^[-*•]|^\d+[.)]\s/.test(line))
      .map(cleanSubTaskCandidate)
      .slice(0, 5);

    return {
      headline: title.trim() || "Note summary",
      summary: lines[0] ?? trimmed,
      keyPoints: bulletLines,
      nextSteps: [],
    };
  }
}

function cleanSubTaskCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[-*•\s]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/[;:,.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function inferSubTasksFromNote(content: string | null | undefined): string[] {
  if (!content) return [];
  const candidates = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^([-*•]|\d+[.)]|\[[ xX]\])\s+/.test(line))
    .map(cleanSubTaskCandidate)
    .filter((line) => line.length >= 3 && line.length <= 90);
  return [...new Set(candidates)].slice(0, 6);
}

function fallbackMeetingArtifacts(
  title: string,
  notes: string[],
): MeetingArtifactsDraft {
  const normalizedTitle = title.trim() || "Meeting";
  const noteTitle = normalizedTitle.toLowerCase().includes("meeting")
    ? normalizedTitle
    : `${normalizedTitle} Meeting`;
  const transcript = notes.map((note) => `- ${note}`).join("\n");
  const summary = notes.slice(0, 3).join(" ").trim();
  const joinedNotes = notes.join("\n");

  return {
    note: {
      title: noteTitle,
      content: ["## Meeting Notes", "", transcript].join("\n"),
    },
    task: {
      title: `Review follow-ups from ${normalizedTitle}`,
      description:
        summary ||
        "Review the captured meeting notes and confirm next actions.",
      priority: "medium",
      subTasks: inferSubTasksFromNote(joinedNotes),
    },
  };
}

function parseMeetingArtifacts(
  text: string,
  fallback: MeetingArtifactsDraft,
): MeetingArtifactsDraft | null {
  try {
    const parsed = JSON.parse(stripMarkdownCodeFence(text)) as {
      note?: Partial<MeetingNoteDraft>;
      task?: Partial<AiTaskDraft>;
    };

    const noteTitle = parsed.note?.title?.trim() || fallback.note.title;
    const noteContent = parsed.note?.content?.trim() || fallback.note.content;
    const task = parsed.task;
    const taskTitle = task?.title?.trim();
    if (!taskTitle) return null;

    const priority =
      task?.priority === "low" ||
      task?.priority === "medium" ||
      task?.priority === "high"
        ? task.priority
        : fallback.task.priority;

    const subTasks = Array.isArray(task?.subTasks)
      ? task.subTasks
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 6)
      : fallback.task.subTasks;

    return {
      note: {
        title: noteTitle,
        content: noteContent,
      },
      task: {
        title: taskTitle,
        description: task?.description?.trim() || fallback.task.description,
        priority,
        subTasks,
      },
    };
  } catch {
    return null;
  }
}

// ── Categorization ───────────────────────────────────────────────────────────

async function categorizeBatch(
  kind: CategoryKind,
  items: readonly CategoryInput[],
  existingCategories: readonly string[],
): Promise<CategorizeBatchResult> {
  if (items.length === 0) {
    return { assignments: [], model: null, error: null };
  }

  const assignments: CategoryAssignment[] = [];
  let model: string | null = null;

  for (const chunk of chunkCategoryInputs(items)) {
    const request = buildCategorizationRequest(kind, chunk, existingCategories);
    const result = await requestAiText(request.prompt, 1200, {
      priority: "background",
      label: `Categorizing ${kind}s`,
      reasoningMode: "fastest",
      dedupeKey: `categorize:${kind}:${chunk.map((item) => item.id).join(":")}`,
      outputSchema: request.outputSchema,
    });
    model = result.model ?? model;

    if (!result.text) {
      return { assignments, model, error: result.error };
    }

    const chunkAssignments = parseCategorizationResponse(
      result.text,
      chunk,
      request.allowed,
    );
    assignments.push(...chunkAssignments);

    if (chunkAssignments.length !== chunk.length) {
      return {
        assignments,
        model,
        error: `Luna returned ${chunkAssignments.length} valid categories for ${chunk.length} items.`,
      };
    }
  }

  return { assignments, model, error: null };
}

export function categorizeTasks(
  tasks: readonly CategoryInput[],
  existingCategories: readonly string[] = [],
): Promise<CategorizeBatchResult> {
  return categorizeBatch("task", tasks, existingCategories);
}

export function categorizeNotes(
  notes: readonly CategoryInput[],
  existingCategories: readonly string[] = [],
): Promise<CategorizeBatchResult> {
  return categorizeBatch("note", notes, existingCategories);
}

export async function categorizeTask(
  title: string,
  description: string | null | undefined,
  _apiKey?: string,
  existingCategories: readonly string[] = [],
  entityId?: string,
): Promise<CategorizeTaskResult> {
  const result = await categorizeTasks(
    [{ id: entityId ?? "task", title, context: description }],
    existingCategories,
  );
  const category = result.assignments[0]?.category ?? null;

  return {
    category,
    model: result.model,
    error: category ? null : result.error ?? "Luna returned an empty category.",
  };
}

export async function categorizeNote(
  title: string,
  content: string | null | undefined,
  existingCategories: readonly string[] = [],
  entityId?: string,
): Promise<CategorizeTaskResult> {
  const result = await categorizeNotes(
    [{ id: entityId ?? "note", title, context: content }],
    existingCategories,
  );
  const category = result.assignments[0]?.category ?? null;

  return {
    category,
    model: result.model,
    error: category ? null : result.error ?? "Luna returned an empty category.",
  };
}

// ── Convert Note to Task ─────────────────────────────────────────────────────

export async function convertNoteToTaskDraft(
  title: string,
  content: string | null | undefined,
  _apiKey?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<ConvertNoteToTaskResult> {
  const prompt = [
    "You are a productivity expert. Convert the following note into a single well-structured, actionable task.",
    "Respond with raw JSON only  -  no markdown fences, no commentary.",
    "",
    'Required JSON shape: {"title":"string","description":"string","priority":"low|medium|high","subTasks":["string"]}',
    "",
    "=== TITLE ===",
    "- Start with an imperative action verb: Build, Research, Schedule, Review, Draft, Fix, Organize, etc.",
    "- Concisely capture the primary goal (max 80 characters)",
    "- Never begin with 'I need to', 'I should', or 'Task to'",
    "- Make it specific enough to be actionable on its own",
    "",
    "=== DESCRIPTION ===",
    "- 1-3 sentences capturing context, constraints, acceptance criteria, or the 'why'",
    "- Include deadlines, dependencies, or key requirements from the note",
    "- Do NOT restate the title or list procedural steps",
    '- Use "" (empty string) when the title is fully self-explanatory',
    "",
    "=== PRIORITY ===",
    "- high: explicit urgency, near deadline, blocks other work, or marked important/urgent in the note",
    "- medium: clearly important but not time-critical or blocking",
    "- low: nice-to-have, someday/maybe, no pressure or deadline",
    "- When in doubt, pick medium",
    "",
    "=== SUB-TASKS ===",
    "- Extract sub-tasks when the note lists distinct, independently completable actions (checklists, steps, errands)",
    "- Each sub-task should be a clear action phrase (3-80 characters)",
    "- Aim for 0-6 sub-tasks depending on note complexity:",
    "  * 0: single-action note, vague idea, reminder, or pure reference material",
    "  * 1-3: note describes a short sequence of clearly distinct steps",
    "  * 4-6: note outlines a detailed multi-step process with many actionable items",
    "- Do NOT create artificial sub-tasks by splitting one continuous action",
    "- Context, motivation, reference links, and 'why' belong in the description, not as sub-tasks",
    "",
    "=== INPUT NOTE ===",
    `Title: ${title}`,
    `Content: ${content || "(empty)"}`,
  ].join("\n");

  const result = await requestAiText(prompt, 500, {
    priority: "user",
    label: "Convert note to task",
  });
  if (!result.text) {
    return { draft: null, model: result.model, error: result.error };
  }

  const draft = parseTaskDraft(result.text);
  if (!draft) {
    return {
      draft: null,
      model: result.model,
      error: `Luna returned invalid JSON: ${result.text.slice(0, 180)}`,
    };
  }

  if (draft.subTasks.length === 0) {
    const inferred = inferSubTasksFromNote(content);
    if (inferred.length > 0) draft.subTasks = inferred;
  }

  return { draft, model: result.model, error: null };
}

export async function summarizeNote(
  title: string,
  content: string | null | undefined,
  _apiKey?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<SummarizeNoteResult> {
  const prompt = [
    "You are Luna, the AI assistant inside a notes app.",
    "Summarize the following note for a quick, polished in-app summary view.",
    "Respond with raw JSON only. No markdown fences. No commentary outside the JSON.",
    "",
    'Required JSON shape: {"headline":"string","summary":"string","keyPoints":["string"],"nextSteps":["string"]}',
    "",
    "Rules:",
    "- headline: 3-8 words, sharp and descriptive, not identical to the note title unless needed",
    "- summary: 2-4 concise sentences that capture the essence, context, and why it matters",
    "- keyPoints: 2-5 short bullets with concrete facts, decisions, themes, or constraints from the note",
    "- nextSteps: 0-4 brief action suggestions only when the note implies obvious follow-up actions; otherwise return []",
    "- Avoid filler, repetition, and generic productivity advice",
    "- Stay faithful to the note. Do not invent facts",
    "",
    "=== INPUT NOTE ===",
    `Title: ${title}`,
    `Content: ${content || "(empty)"}`,
  ].join("\n");

  const result = await requestAiText(prompt, 450, {
    priority: "user",
    label: "Summarize note",
  });
  if (!result.text) {
    return { summary: null, model: result.model, error: result.error };
  }

  const summary = parseNoteSummary(result.text, title);
  if (!summary) {
    return {
      summary: null,
      model: result.model,
      error: `Luna returned an invalid summary payload: ${result.text.slice(0, 180)}`,
    };
  }

  return { summary, model: result.model, error: null };
}

export async function generateMeetingArtifacts(
  title: string,
  notes: string[],
): Promise<GenerateMeetingArtifactsResult> {
  const cleanedNotes = notes.map((note) => note.trim()).filter(Boolean);
  if (cleanedNotes.length === 0) {
    return {
      artifacts: null,
      model: null,
      error: "Add at least one meeting note before ending the session.",
    };
  }

  const fallback = fallbackMeetingArtifacts(title, cleanedNotes);
  const prompt = [
    "You are Luna inside Orbit. Convert these raw meeting notes into one polished note and one actionable follow-up task.",
    "Respond with raw JSON only. No markdown fences. No commentary.",
    "",
    'Required JSON shape: {"note":{"title":"string","content":"string"},"task":{"title":"string","description":"string","priority":"low|medium|high","subTasks":["string"]}}',
    "",
    "Rules for the note:",
    "- Title should be concise and specific to the meeting.",
    "- Content must be markdown.",
    "- Prefer a clean structure with headings like Summary, Decisions, Risks, and Action Items when supported by the notes.",
    "- Stay faithful to the notes. Do not invent facts.",
    "",
    "Rules for the task:",
    "- Create exactly one task representing the most important next step from the meeting.",
    "- Use an action-oriented title starting with a verb.",
    "- description should give enough context for someone reopening the task later.",
    "- subTasks should capture concrete follow-up items when they exist.",
    "- If the meeting has no obvious action item, create a task to review the meeting outcomes.",
    "",
    `Meeting title: ${title.trim() || "Meeting"}`,
    "Meeting notes:",
    ...cleanedNotes.map((note, index) => `${index + 1}. ${note}`),
  ].join("\n");

  const result = await requestAiText(prompt, 700, {
    priority: "user",
    label: "Meeting wrap-up",
  });
  if (!result.text) {
    return {
      artifacts: null,
      model: result.model,
      error: result.error,
    };
  }

  const artifacts = parseMeetingArtifacts(result.text, fallback);
  if (!artifacts) {
    return {
      artifacts: fallback,
      model: result.model,
      error:
        "Luna returned an invalid meeting payload. Orbit used a structured fallback instead.",
    };
  }

  if (artifacts.task.subTasks.length === 0) {
    const inferred = inferSubTasksFromNote(cleanedNotes.join("\n"));
    if (inferred.length > 0) artifacts.task.subTasks = inferred;
  }

  return {
    artifacts,
    model: result.model,
    error: null,
  };
}

// ── Generate Project Starter Plan ─────────────────────────────────────────────

export async function generateProjectStarterPlan(
  name: string,
  description: string | null | undefined,
): Promise<ProjectStarterPlanResult> {
  const prompt = [
    "You are a productivity expert. Generate a concise starter plan for a new project.",
    "Respond with raw JSON only  -  no markdown fences, no commentary.",
    "",
    'Required JSON shape: {"tasks":[{"title":"string","description":"string","priority":"low|medium|high","subTasks":["string"]}]}',
    "",
    "Rules:",
    "- Generate 3-6 tasks that cover the essential first steps to get this project off the ground.",
    "- Each task title must start with an action verb and be concise (max 80 chars).",
    "- description: 1-2 sentences of context or acceptance criteria. Use empty string if the title is self-explanatory.",
    "- priority: high for critical/blocking first tasks, medium for standard steps, low for optional polish tasks.",
    "- subTasks: 0-4 concrete sub-steps per task. Only include when the task genuinely breaks into distinct actions.",
    "- Tasks should be ordered logically (e.g. research before build, setup before deploy).",
    "- Do NOT include vague feel-good tasks. Every task must be actionable.",
    "",
    `Project name: ${name}`,
    description ? `Project description: ${description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await requestAiText(prompt, 800, {
    priority: "user",
    label: "Project starter plan",
  });
  if (!result.text) {
    return { tasks: [], model: result.model, error: result.error };
  }

  try {
    const parsed = JSON.parse(stripMarkdownCodeFence(result.text)) as {
      tasks?: unknown[];
    };
    const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const tasks: AiTaskDraft[] = rawTasks
      .map((item) => parseTaskDraft(JSON.stringify(item)))
      .filter((t): t is AiTaskDraft => t !== null)
      .slice(0, 6);
    if (tasks.length === 0) {
      return {
        tasks: [],
        model: result.model,
        error: "Luna returned no usable tasks.",
      };
    }
    return { tasks, model: result.model, error: null };
  } catch {
    return {
      tasks: [],
      model: result.model,
      error: `Luna returned invalid JSON: ${result.text.slice(0, 180)}`,
    };
  }
}

// ── Suggest Sub-tasks ─────────────────────────────────────────────────────────

export async function suggestSubTasks(
  title: string,
  description: string | null | undefined,
): Promise<SuggestSubTasksResult> {
  const prompt = [
    "You are a productivity expert. Suggest concrete sub-tasks for the following task.",
    "Respond with raw JSON only  -  no markdown fences, no commentary.",
    "",
    'Required JSON shape: {"subTasks":["string"]}',
    "",
    "Rules:",
    "- Return 2-5 specific, independently completable action phrases.",
    "- Each sub-task should start with a verb and be 5-80 characters long.",
    "- Do NOT restate the main task title as a sub-task.",
    "- Do NOT create artificial splits of one continuous action.",
    "- Return an empty array if the task is already atomic.",
    "",
    `Task title: ${title}`,
    description ? `Task description: ${description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await requestAiText(prompt, 250, {
    priority: "user",
    label: "Suggest sub-tasks",
  });
  if (!result.text) {
    return { subTasks: [], model: result.model, error: result.error };
  }

  try {
    const parsed = JSON.parse(stripMarkdownCodeFence(result.text)) as {
      subTasks?: unknown[];
    };
    const subTasks = coerceStringList(parsed.subTasks, 5);
    return { subTasks, model: result.model, error: null };
  } catch {
    return {
      subTasks: [],
      model: result.model,
      error: `Luna returned invalid JSON: ${result.text.slice(0, 180)}`,
    };
  }
}

// ── Generate Meeting Agenda ───────────────────────────────────────────────────

export async function generateMeetingAgenda(
  title: string,
): Promise<GenerateMeetingAgendaResult> {
  const prompt = [
    "You are a meeting facilitator. Generate a concise, structured meeting agenda for the following meeting.",
    "Respond with markdown only  -  no JSON, no preamble, no sign-off.",
    "",
    "Rules:",
    "- Use a short intro line, then a numbered list of 3-6 agenda items.",
    "- Each item should be short (one line) and actionable.",
    "- End with a single line: 'Action items & next steps'.",
    "- Do NOT add a title heading  -  the meeting already has a title.",
    "- Keep the total response under 200 words.",
    "",
    `Meeting title: ${title}`,
  ].join("\n");

  const result = await requestAiText(prompt, 300, {
    priority: "user",
    label: "Meeting agenda",
  });
  if (!result.text) {
    return { agenda: null, model: result.model, error: result.error };
  }

  return { agenda: result.text.trim(), model: result.model, error: null };
}

// ── Luna Chat ────────────────────────────────────────────────────────────────

interface LunaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const LUNA_TOOLS: LunaTool[] = [
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a new task for the user. Use when the user asks to create, add, or schedule a task. Include project_name to create the task directly inside a project. Call this multiple times when the user requests multiple tasks or combined task-plus-note workflows.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Task title  -  start with an action verb",
          },
          description: {
            type: "string",
            description: "Optional context or details",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Task priority (default medium)",
          },
          due_date: {
            type: "string",
            description: "Optional due date in YYYY-MM-DD format",
          },
          sub_tasks: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of sub-task titles",
          },
          project_name: {
            type: "string",
            description:
              "Optional project name to link this task to immediately after creation",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Create a new note for the user. Use when the user asks to write down, save, remember, or jot something. Include project_name to create the note directly inside a project. Call this multiple times when the user requests multiple notes or a note alongside another action.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Note title" },
          content: { type: "string", description: "Note body in markdown" },
          project_name: {
            type: "string",
            description:
              "Optional project name to link this note to immediately after creation",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_task",
      description:
        "Archive a task by its title, removing it from the active list. Use when the user asks to archive, dismiss, or put a task away.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description:
              "The exact title of the task to archive as shown in the task list",
          },
        },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description:
        "Mark a task as complete by its title. Use when the user says a task is done, finished, or completed.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description: "The exact title of the task to mark as complete",
          },
        },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_note",
      description:
        "Permanently delete a note by its title. Only use when the user explicitly asks to delete or remove a note.",
      parameters: {
        type: "object",
        properties: {
          note_title: {
            type: "string",
            description:
              "The exact title of the note to delete as shown in the notes list",
          },
        },
        required: ["note_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transform_text",
      description:
        "Apply a writing assistant transformation to a piece of text. Returns the transformed text for you to present to the user. Available modes: improve (enhance clarity/quality), grammar (fix errors), rephrase (reword), formal (professional tone), casual (friendly tone), expand (add detail), shorten (make concise), bullets (convert to bullet list), continue (extend the writing), email (reformat as a formal email with greeting and signature).",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text to transform",
          },
          mode: {
            type: "string",
            enum: [
              "improve",
              "grammar",
              "rephrase",
              "formal",
              "casual",
              "expand",
              "shorten",
              "bullets",
              "continue",
              "email",
            ],
            description: "The writing transformation to apply",
          },
        },
        required: ["text", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_meeting",
      description:
        "Start a new meeting session. Use when the user wants to begin recording a meeting or start meeting mode.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title for the new meeting session",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_meeting_entry",
      description:
        "Add a note entry to the currently active meeting session. Use when the user dictates something to record during a meeting.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The meeting note content to add",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "end_meeting",
      description:
        "Discard and close the current active meeting session. Use when the user wants to stop or cancel the meeting.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recategorize_tasks",
      description:
        "Clear all existing task categories and regenerate them using AI. Use when the user asks to re-categorize, refresh, or regenerate task categories.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recategorize_notes",
      description:
        "Clear all existing note categories and regenerate them using AI. Use when the user asks to re-categorize, refresh, or regenerate note categories.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description:
        "Update an existing task's title, description, priority, or due date. Use when the user asks to edit, change, rename, or modify a task.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description: "The current title of the task to update",
          },
          new_title: {
            type: "string",
            description: "New title (omit to keep existing)",
          },
          description: {
            type: "string",
            description: "New description (omit to keep existing)",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "New priority (omit to keep existing)",
          },
          due_date: {
            type: "string",
            description:
              "New due date in YYYY-MM-DD format, or empty string to clear it (omit to keep existing)",
          },
        },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_subtasks",
      description:
        "Add one or more sub-tasks to an existing task. Existing sub-tasks are preserved. Use when the user asks to add steps, checklist items, or sub-tasks to a task.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description: "The title of the task to add sub-tasks to",
          },
          sub_tasks: {
            type: "array",
            items: { type: "string" },
            description: "List of sub-task titles to add",
          },
        },
        required: ["task_title", "sub_tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description:
        "Update an existing note's title or content. Use when the user asks to edit, change, rename, or modify a note.",
      parameters: {
        type: "object",
        properties: {
          note_title: {
            type: "string",
            description: "The current title of the note to update",
          },
          new_title: {
            type: "string",
            description: "New title (omit to keep existing)",
          },
          content: {
            type: "string",
            description: "New content in markdown (omit to keep existing)",
          },
        },
        required: ["note_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description:
        "Create a new project to organize tasks and notes around a goal. Use when the user asks to create or start a new project.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Project name",
          },
          description: {
            type: "string",
            description: "Optional description of the project goal",
          },
          deadline: {
            type: "string",
            description: "Optional deadline in YYYY-MM-DD format",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_task_to_project",
      description:
        "Link an existing task to a project. Use when the user asks to add a task to a project or assign a task to a project.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description: "The title of the task to link",
          },
          project_name: {
            type: "string",
            description: "The name of the project to link the task to",
          },
        },
        required: ["task_title", "project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_note_to_project",
      description:
        "Link an existing note to a project. Use when the user asks to add a note to a project or associate a note with a project.",
      parameters: {
        type: "object",
        properties: {
          note_title: {
            type: "string",
            description: "The title of the note to link",
          },
          project_name: {
            type: "string",
            description: "The name of the project to link the note to",
          },
        },
        required: ["note_title", "project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unarchive_task",
      description:
        "Restore an archived task back to the active task list. Use when the user asks to unarchive, restore, or bring back an archived task.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description:
              "The exact title of the archived task to restore as shown in the archived tasks list",
          },
        },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description:
        "Permanently delete a task. Works on both active and archived tasks. Only use when the user explicitly asks to permanently delete or remove a task forever.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description: "The exact title of the task to permanently delete",
          },
        },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_project",
      description:
        "Delete a project. This removes the project but does not delete the tasks or notes linked to it. Use when the user asks to delete or remove a project.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "The name of the project to delete",
          },
        },
        required: ["project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project",
      description:
        "Update an existing project's name, description, or deadline. Use when the user asks to edit, rename, or modify a project.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "The current name of the project to update",
          },
          new_name: {
            type: "string",
            description: "New project name (omit to keep existing)",
          },
          description: {
            type: "string",
            description: "New description (omit to keep existing)",
          },
          deadline: {
            type: "string",
            description:
              "New deadline in YYYY-MM-DD format, or empty string to clear it (omit to keep existing)",
          },
        },
        required: ["project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unlink_task_from_project",
      description:
        "Remove a task from a project without deleting either. Use when the user asks to remove, detach, or unlink a task from a project.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description: "The title of the task to unlink",
          },
          project_name: {
            type: "string",
            description: "The name of the project to unlink the task from",
          },
        },
        required: ["task_title", "project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unlink_note_from_project",
      description:
        "Remove a note from a project without deleting either. Use when the user asks to remove, detach, or unlink a note from a project.",
      parameters: {
        type: "object",
        properties: {
          note_title: {
            type: "string",
            description: "The title of the note to unlink",
          },
          project_name: {
            type: "string",
            description: "The name of the project to unlink the note from",
          },
        },
        required: ["note_title", "project_name"],
      },
    },
  },
];

export function buildLunaSystemPrompt(context: {
  tasks: {
    title: string;
    description?: string | null;
    priority: string;
    due_date?: string | null;
    completed: boolean;
    subTasks?: { title: string; completed: boolean }[];
  }[];
  archivedTasks?: {
    title: string;
    description?: string | null;
    priority: string;
    completed: boolean;
  }[];
  notes: { title: string; content?: string | null; updated_at?: string }[];
  projects?: {
    id: string;
    name: string;
    description?: string;
    deadline?: string | null;
    taskIds: string[];
    noteIds: string[];
  }[];
  meetingSessions?: {
    active: {
      title: string;
      startedAt: string;
      entries: { content: string; createdAt: string }[];
    } | null;
    completed: {
      title: string;
      endedAt: string | null;
      artifactNote?: string | null;
      artifactTask?: string | null;
    }[];
  };
}): string {
  const now = new Date().toISOString();

  const taskLines = context.tasks
    .slice(0, 50)
    .map((t) => {
      const parts: string[] = [
        `- [${t.completed ? "x" : " "}] ${t.title} (${t.priority}${t.due_date ? `, due ${t.due_date}` : ""})`,
      ];
      if (t.description?.trim()) {
        const snippet = t.description.trim().slice(0, 180);
        parts.push(
          `  Description: ${snippet}${t.description.trim().length > 180 ? "…" : ""}`,
        );
      }
      if (t.subTasks && t.subTasks.length > 0) {
        parts.push(`  Sub-tasks:`);
        for (const st of t.subTasks) {
          parts.push(`    - [${st.completed ? "x" : " "}] ${st.title}`);
        }
      }
      return parts.join("\n");
    })
    .join("\n");

  const noteLines = context.notes
    .slice(0, 30)
    .map((n) => {
      const lines: string[] = [`- ${n.title}`];
      if (n.content?.trim()) {
        const snippet = n.content.trim().slice(0, 220);
        lines.push(
          `  Content: ${snippet}${n.content.trim().length > 220 ? "…" : ""}`,
        );
      }
      return lines.join("\n");
    })
    .join("\n");

  const projectLines =
    context.projects && context.projects.length > 0
      ? context.projects
          .slice(0, 20)
          .map((p) => {
            const parts: string[] = [
              `- ${p.name}${p.deadline ? ` (deadline: ${p.deadline.slice(0, 10)})` : ""}`,
            ];
            if (p.description?.trim()) {
              parts.push(
                `  Description: ${p.description.trim().slice(0, 150)}`,
              );
            }
            parts.push(
              `  Tasks linked: ${p.taskIds.length}, Notes linked: ${p.noteIds.length}`,
            );
            return parts.join("\n");
          })
          .join("\n")
      : null;

  const meetingLines: string[] = [];
  if (context.meetingSessions) {
    const { active, completed } = context.meetingSessions;
    if (active) {
      meetingLines.push("Active meeting session:");
      meetingLines.push(`  Title: ${active.title}`);
      meetingLines.push(`  Started: ${active.startedAt}`);
      if (active.entries.length > 0) {
        meetingLines.push(
          `  Notes captured so far (${active.entries.length}):`,
        );
        active.entries.slice(-20).forEach((e, i) => {
          meetingLines.push(`    ${i + 1}. ${e.content}`);
        });
      } else {
        meetingLines.push("  No notes captured yet.");
      }
    } else {
      meetingLines.push("No active meeting session.");
    }

    if (completed.length > 0) {
      meetingLines.push(
        `\nPast meeting sessions (${completed.length} total, most recent first):`,
      );
      completed.slice(0, 8).forEach((s) => {
        const parts: string[] = [
          `  - "${s.title}"${s.endedAt ? ` (ended ${s.endedAt.slice(0, 10)})` : ""}`,
        ];
        if (s.artifactNote) parts.push(`    → Note: "${s.artifactNote}"`);
        if (s.artifactTask) parts.push(`    → Task: "${s.artifactTask}"`);
        meetingLines.push(parts.join("\n"));
      });
    } else {
      meetingLines.push("No past meeting sessions.");
    }
  }

  const archivedLines =
    context.archivedTasks && context.archivedTasks.length > 0
      ? context.archivedTasks
          .slice(0, 30)
          .map((t) => {
            const parts: string[] = [
              `- ${t.title} (${t.priority}${t.completed ? ", completed" : ""})`,
            ];
            if (t.description?.trim()) {
              const snippet = t.description.trim().slice(0, 120);
              parts.push(
                `  Description: ${snippet}${t.description.trim().length > 120 ? "…" : ""}`,
              );
            }
            return parts.join("\n");
          })
          .join("\n")
      : null;

  return [
    `You are Luna, the smart and friendly AI assistant built into Orbit  -  a personal productivity app for managing tasks, notes, and meetings. Today's date is ${now.slice(0, 10)}.`,
    "",
    "Your capabilities:",
    "- Answer questions about the user's tasks, notes, projects, priorities, schedule, and meeting sessions",
    "- Create new tasks (with sub-tasks, priority, due date, and optional project) and notes using the provided tools",
    "- Update existing tasks (title, description, priority, due date) and notes (title, content) using the provided tools",
    "- Add sub-tasks to existing tasks using add_subtasks",
    "- Archive or mark tasks as complete using the provided tools",
    "- Unarchive tasks to restore them from the archive back to the active list",
    "- Permanently delete tasks (active or archived) and notes when explicitly asked",
    "- Create, update, and delete projects",
    "- Link and unlink tasks or notes to/from projects",
    "- When the user asks to create a task or note inside a specific project, pass project_name to create_task or create_note to link it automatically",
    "- Apply writing assistant transformations to any text (improve, fix grammar, rephrase, make formal/casual, expand, shorten, convert to bullets, continue writing, or format as email)",
    "- Start a new meeting session, add entries to the active meeting, and end/discard it",
    "- Clear and regenerate AI categories for tasks or notes",
    "- Give productivity advice: help prioritize, suggest time management strategies, break down large goals",
    "- Summarize, analyze, and find patterns across the user's data",
    "- Help with brainstorming, planning, and organizing ideas",
    "- Discuss past and active meeting sessions  -  their notes, outcomes, and follow-ups",
    "- Chat freely on any topic the user brings up",
    "",
    "Guidelines:",
    "- Be concise but thorough. Use markdown formatting (bold, lists, headers) when it helps readability.",
    "- When creating tasks, write clear action-oriented titles starting with verbs. Set appropriate priorities and due dates when context allows.",
    "- When creating notes, use markdown formatting for the content body.",
    "- For archive_task, complete_task, delete_note, delete_task, update_task, and update_note  -  use the exact task/note title as it appears in the lists below.",
    "- For unarchive_task  -  use the exact title from the Archived Tasks list below.",
    "- For delete_task  -  check both active tasks and archived tasks lists to find a match.",
    "- For update_project, delete_project  -  use the exact project name from the list below.",
    "- For create_task and create_note, pass project_name to link the new item to a project in one step instead of calling link_task_to_project separately.",
    "- For link/unlink tools  -  match on the task/note title and project name from the lists below.",
    "- For transform_text, call the tool with the user's text and the appropriate mode, then present the result in your reply.",
    "- If the user asks for multiple deliverables or actions in one message, complete all of them in the same turn before giving your final reply.",
    "- Use tools as many times as needed. Do not stop after the first tool call if the user asked for additional tasks, notes, or other creations.",
    "- Before your final reply, verify that every explicit create, add, save, schedule, archive, unarchive, complete, delete, update, link, or unlink request from the latest user message has been handled.",
    "- After using a tool, briefly confirm what was done.",
    "- If the user's request is ambiguous, ask a clarifying question rather than guessing.",
    "- Be warm and encouraging but not overly verbose.",
    "",
    `The user currently has ${context.tasks.filter((t) => !t.completed).length} open task(s), ${context.tasks.filter((t) => t.completed).length} completed task(s), ${context.archivedTasks?.length ?? 0} archived task(s), ${context.notes.length} note(s), and ${context.projects?.length ?? 0} project(s).`,
    context.tasks.length > 0
      ? `\nTasks (open first, then completed):\n${taskLines}`
      : "",
    archivedLines ? `\nArchived Tasks:\n${archivedLines}` : "",
    context.notes.length > 0
      ? `\nNotes (most recently updated first):\n${noteLines}`
      : "",
    projectLines ? `\nProjects:\n${projectLines}` : "",
    meetingLines.length > 0
      ? `\nMeeting Mode:\n${meetingLines.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface StreamLunaChatOptions {
  thinkingEnabled?: boolean;
  sessionId?: string;
}

function shouldRetryWithoutThinking(status: number, bodyText: string): boolean {
  if (!bodyText) return false;
  if (status !== 400 && status !== 422) return false;

  const normalized = bodyText.toLowerCase();
  return (
    normalized.includes("thinking") ||
    normalized.includes("reasoning") ||
    normalized.includes("unsupported") ||
    normalized.includes("invalid_parameter") ||
    normalized.includes("max_tokens")
  );
}

export async function streamLunaChat(
  messages: ChatMessage[],
  _apiKey: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options?: StreamLunaChatOptions,
): Promise<string | null> {
  if (window.orbitDesktop) {
    const model = getActiveModel();
    if (!model) {
      callbacks.onError("No Codex model selected. Choose one in Settings → Luna.");
      return null;
    }
    const scopeId = options?.sessionId ?? `luna-${Date.now()}`;
    return aiQueue.run(
      {
        priority: "interactive",
        label: "Luna chat",
        scopeId,
        signal,
      },
      async () => {
        let fullText = "";
        let reasoning = "";
        const prompt = [
          "The following is an Orbit conversation. Continue it by answering the latest USER message.",
          "Use an available Orbit tool whenever the user asks to create, update, link, archive, complete, or delete app data.",
          "",
          ...messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`),
          "",
          "ASSISTANT:",
        ].join("\n");
        try {
          const result = await runCodexCompletion(
            {
              prompt,
              model,
              effort: getActiveEffort(),
              tools: LUNA_TOOLS.map((tool) => ({
                name: tool.function.name,
                description: tool.function.description,
                inputSchema: tool.function.parameters,
              })),
            },
            {
              onToken: (delta) => {
                fullText += delta;
                callbacks.onToken(delta);
              },
              onReasoning: (delta) => {
                reasoning += delta;
                callbacks.onReasoningToken?.(delta);
              },
              onToolCall: callbacks.onToolCall,
            },
            signal,
          );
          callbacks.onDone(fullText || result.text, reasoning || undefined);
          return result.model;
        } catch (error) {
          callbacks.onError(error instanceof Error ? error.message : String(error));
          return null;
        }
      },
    );
  }

  const apiKey = getActiveApiKey();
  if (!apiKey) {
    callbacks.onError("No API key configured. Go to Settings → Luna.");
    return null;
  }

  const headers = getRequestHeaders(apiKey);
  const models = getActiveModels();
  if (models.length === 0) {
    callbacks.onError("No model selected. Choose a model in Settings → Luna.");
    return null;
  }

  const thinkingEnabled = !!options?.thinkingEnabled;
  const scopeId = options?.sessionId ?? `luna-${Date.now()}`;

  return aiQueue.run(
    {
      priority: "interactive",
      label: "Luna chat",
      scopeId,
      signal,
    },
    async () => {
      for (const model of models) {
        try {
      // Local type for messages sent to the API (superset of ChatMessage).
      // tool/assistant-with-tool_calls messages are only added in follow-up rounds.
      type ApiMessage =
        | { role: "system" | "user"; content: string }
        | {
            role: "assistant";
            content: string | null;
            tool_calls?: {
              id: string;
              type: "function";
              function: { name: string; arguments: string };
              extra_content?: { google: { thought_signature: string } };
            }[];
          }
        | { role: "tool"; content: string; tool_call_id: string };

      let currentMessages: ApiMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      let accumText = "";
      let accumReasoning = "";
      let modelFailed = false;
      let allowThinking = thinkingEnabled;
      let announcedThinkingFallback = false;

      // Agentic loop: keep going until model responds with text (no tool calls)
      // or we hit the round cap. Each round may call tools and loop back.
      for (let round = 0; round < 5; round++) {
        const body: Record<string, unknown> = {
          model,
          messages: currentMessages,
          tools: LUNA_TOOLS,
          stream: true,
        };

        if (allowThinking) {
          body.thinking = { type: "enabled" };
          body.max_tokens = 8192;
        } else {
          body.temperature = 0.5;
          // Reasoning models spend output tokens on hidden reasoning before
          // any answer text streams; a small cap can be fully consumed by
          // reasoning, leaving an empty reply. max_tokens is a ceiling, so a
          // larger budget is free for non-reasoning models.
          body.max_tokens = 4096;
        }

        const endpoint = getChatEndpoint(model);
        const res = await fetchWithRetry(
          endpoint,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal,
          },
          {
            signal,
            onRetry: ({ status, delayMs }) => {
              const seconds = Math.ceil(delayMs / 1000);
              aiQueue.setRetryMessage(
                status === 429
                  ? `Rate limited  -  retrying in ${seconds}s…`
                  : `Upstream error  -  retrying in ${seconds}s…`,
              );
            },
          },
        ).finally(() => aiQueue.setRetryMessage(null));

        if (!res.ok) {
          const errText = await res.text();
          if (
            allowThinking &&
            shouldRetryWithoutThinking(res.status, errText)
          ) {
            allowThinking = false;
            if (!announcedThinkingFallback) {
              callbacks.onThinkingFallback?.();
              announcedThinkingFallback = true;
            }
            round -= 1;
            continue;
          }
          if (res.status === 400 && errText.includes("stream")) {
            // If tool calls have already run in a previous round, do NOT
            // restart from scratch (which would re-execute the tools).
            // Instead, attempt a simple non-streaming follow-up with the
            // current conversation state to get the final summary.
            if (round > 0) {
              try {
                const followBody: Record<string, unknown> = {
                  model,
                  messages: currentMessages,
                  max_tokens: 4096,
                };
                const followRes = await fetchWithRetry(
                  getChatEndpoint(model),
                  {
                    method: "POST",
                    headers,
                    body: JSON.stringify(followBody),
                    signal,
                  },
                  { signal },
                );
                if (followRes.ok) {
                  const data = (await followRes.json()) as {
                    choices?: { message?: { content?: string } }[];
                  };
                  const text =
                    data.choices?.[0]?.message?.content?.trim() ?? "";
                  if (text) {
                    accumText += text;
                    callbacks.onToken(text);
                  }
                }
              } catch {
                /* fall through */
              }
              // Tool action already succeeded  -  surface what we have
              callbacks.onDone(accumText, accumReasoning || undefined);
              return model;
            }
            return await nonStreamingFallback(
              messages,
              headers,
              model,
              callbacks,
              signal,
              allowThinking,
            );
          }
          modelFailed = true;
          break;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          callbacks.onError("No response stream available.");
          return model;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let roundText = "";
        let roundReasoning = "";
        const toolCalls: Record<
          number,
          {
            id: string;
            name: string;
            arguments: string;
            extra_content?: { google: { thought_signature: string } };
          }
        > = {};

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload) as {
                choices?: {
                  delta?: {
                    content?: string;
                    reasoning_content?: string;
                    tool_calls?: {
                      index: number;
                      id?: string;
                      function?: { name?: string; arguments?: string };
                      extra_content?: { google: { thought_signature: string } };
                    }[];
                  };
                }[];
                usage?: {
                  prompt_cache_hit_tokens?: number;
                  prompt_cache_miss_tokens?: number;
                };
              };

              // Extract cache info (DeepSeek returns this in the final chunk)
              if (parsed.usage && callbacks.onCacheInfo) {
                const hit = parsed.usage.prompt_cache_hit_tokens ?? 0;
                const miss = parsed.usage.prompt_cache_miss_tokens ?? 0;
                if (hit > 0 || miss > 0) {
                  callbacks.onCacheInfo({
                    cacheHitTokens: hit,
                    cacheMissTokens: miss,
                  });
                }
              }

              const delta = parsed.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.reasoning_content && callbacks.onReasoningToken) {
                roundReasoning += delta.reasoning_content;
                callbacks.onReasoningToken(delta.reasoning_content);
              }

              if (delta.content) {
                roundText += delta.content;
                callbacks.onToken(delta.content);
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index;
                  if (!toolCalls[idx])
                    toolCalls[idx] = { id: "", name: "", arguments: "" };
                  // id only arrives on the first chunk for each tool call
                  if (tc.id) toolCalls[idx].id = tc.id;
                  if (tc.function?.name)
                    toolCalls[idx].name += tc.function.name;
                  if (tc.function?.arguments)
                    toolCalls[idx].arguments += tc.function.arguments;
                  // Gemini 3: capture thought signature for function calling
                  if (tc.extra_content?.google?.thought_signature)
                    toolCalls[idx].extra_content = tc.extra_content;
                }
              }
            } catch {
              // skip malformed SSE chunk
            }
          }
        }

        accumText += roundText;
        accumReasoning += roundReasoning;

        const toolCallEntries = Object.values(toolCalls).filter(
          (tc) => tc.name,
        );

        if (toolCallEntries.length === 0) {
          // No tool calls  -  the model produced its final text response
          callbacks.onDone(accumText, accumReasoning || undefined);
          return model;
        }

        const toolResultPairs = await executeToolCallsSequentially(
          toolCallEntries,
          callbacks.onToolCall,
        );

        // Append the assistant's tool-call turn and the tool results to the
        // conversation, then loop for the model's follow-up response.
        currentMessages = [
          ...currentMessages,
          {
            role: "assistant" as const,
            // Gemini rejects null content in multi-turn messages
            content: roundText || null,
            tool_calls: toolCallEntries.map((tc) => {
              const entry: {
                id: string;
                type: "function";
                function: { name: string; arguments: string };
                extra_content?: { google: { thought_signature: string } };
              } = {
                id: tc.id || `call_${tc.name}_${round}`,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              };
              // Gemini 3: include thought signature so the follow-up round
              // can pass it back (mandatory for function calling)
              if (tc.extra_content) entry.extra_content = tc.extra_content;
              return entry;
            }),
          },
          ...toolResultPairs.map(({ tc, result }) => ({
            role: "tool" as const,
            content: result,
            tool_call_id: tc.id || `call_${tc.name}_${round}`,
          })),
        ];

        allowThinking = false;
      }

      if (modelFailed) continue;

      // Exhausted max rounds  -  return accumulated text
      callbacks.onDone(accumText, accumReasoning || undefined);
      return model;
    } catch {
      if (signal?.aborted) {
        callbacks.onError("Request cancelled.");
        return null;
      }
      continue;
    }
  }

      callbacks.onError(
        "All models failed. Check your API key in Settings → Luna.",
      );
      return null;
    },
  );
}

async function nonStreamingFallback(
  messages: ChatMessage[],
  headers: Record<string, string>,
  model: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  thinkingEnabled?: boolean,
): Promise<string | null> {
  type ApiMessage =
    | { role: "system" | "user"; content: string }
    | {
        role: "assistant";
        content: string | null;
        tool_calls?: {
          id: string;
          type: "function";
          function: { name: string; arguments: string };
          extra_content?: { google: { thought_signature: string } };
        }[];
      }
    | { role: "tool"; content: string; tool_call_id: string };

  const buildBody = (msgs: ApiMessage[], thinking: boolean) => {
    const body: Record<string, unknown> = {
      model,
      messages: msgs,
      tools: LUNA_TOOLS,
    };
    if (thinking) {
      body.thinking = { type: "enabled" };
      body.max_tokens = 8192;
    } else {
      body.temperature = 0.5;
      body.max_tokens = 4096;
    }
    return body;
  };

  let currentMessages: ApiMessage[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  let accumText = "";
  let accumReasoning = "";
  let allowThinking = !!thinkingEnabled;
  let announcedThinkingFallback = false;

  for (let round = 0; round < 5; round++) {
    const res = await fetchWithRetry(
      getChatEndpoint(model),
      {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody(currentMessages, allowThinking)),
        signal,
      },
      { signal },
    );

    if (!res.ok) {
      const errText = await res.text();
      if (allowThinking && shouldRetryWithoutThinking(res.status, errText)) {
        allowThinking = false;
        if (!announcedThinkingFallback) {
          callbacks.onThinkingFallback?.();
          announcedThinkingFallback = true;
        }
        round -= 1;
        continue;
      }
      if (accumText || accumReasoning) {
        callbacks.onDone(accumText, accumReasoning || undefined);
        return model;
      }
      callbacks.onError(`${model} failed (${res.status}).`);
      return null;
    }

    const data = (await res.json()) as {
      model?: string;
      choices?: {
        message?: {
          content?: string;
          reasoning_content?: string;
          tool_calls?: {
            id?: string;
            function: { name: string; arguments: string };
            extra_content?: { google: { thought_signature: string } };
          }[];
        };
      }[];
      usage?: {
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
      };
    };

    if (data.usage) {
      const hit = data.usage.prompt_cache_hit_tokens ?? 0;
      const miss = data.usage.prompt_cache_miss_tokens ?? 0;
      if (hit > 0 || miss > 0) {
        callbacks.onCacheInfo?.({
          cacheHitTokens: hit,
          cacheMissTokens: miss,
        });
      }
    }

    const msg = data.choices?.[0]?.message;
    const roundText = msg?.content?.trim() ?? "";
    const roundReasoning = msg?.reasoning_content?.trim() ?? "";

    if (roundReasoning) {
      accumReasoning += roundReasoning;
      callbacks.onReasoningToken?.(roundReasoning);
    }

    if (roundText) {
      accumText += roundText;
      callbacks.onToken(roundText);
    }

    if (!msg?.tool_calls?.length) {
      callbacks.onDone(accumText, accumReasoning || undefined);
      return data.model ?? model;
    }

    const toolResultPairs: Array<{
      tc: NonNullable<typeof msg.tool_calls>[number];
      result: string;
    }> = [];
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      const result = await Promise.resolve(
        callbacks.onToolCall(tc.function.name, args),
      );
      toolResultPairs.push({ tc, result });
    }

    currentMessages = [
      ...currentMessages,
      {
        role: "assistant" as const,
        // Gemini rejects null content in multi-turn messages
        content: msg.content ?? null,
        tool_calls: msg.tool_calls.map((tc) => {
          const entry: {
            id: string;
            type: "function";
            function: { name: string; arguments: string };
            extra_content?: { google: { thought_signature: string } };
          } = {
            id: tc.id ?? `call_${tc.function.name}_${round}`,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          };
          // Gemini 3: include thought signature for function calling
          if (tc.extra_content?.google?.thought_signature)
            entry.extra_content = tc.extra_content;
          return entry;
        }),
      },
      ...toolResultPairs.map(({ tc, result }) => ({
        role: "tool" as const,
        content: result,
        tool_call_id: tc.id ?? `call_${tc.function.name}_${round}`,
      })),
    ];

    allowThinking = false;
  }

  callbacks.onDone(accumText, accumReasoning || undefined);
  return model;
}

// ── Writing Assistant ─────────────────────────────────────────────────────────

const WRITING_MODE_PROMPTS: Record<WritingMode, string> = {
  improve:
    "Improve the clarity, flow, and overall quality of the following text. Keep the original meaning and tone. Return only the improved text with no explanations.",
  grammar:
    "Fix all grammar, spelling, and punctuation errors in the following text. Keep the style and meaning intact. Return only the corrected text with no explanations.",
  rephrase:
    "Rephrase the following text to say the same thing in a different way. Preserve the meaning and intended audience. Return only the rephrased text with no explanations.",
  formal:
    "Rewrite the following text in a formal, professional tone suitable for business or academic contexts. Return only the rewritten text with no explanations.",
  casual:
    "Rewrite the following text in a friendly, conversational, and casual tone. Return only the rewritten text with no explanations.",
  expand:
    "Expand the following text with more detail, context, and supporting information while staying on topic. Return only the expanded text with no explanations.",
  shorten:
    "Shorten the following text significantly while preserving all key points and meaning. Remove filler and redundancy. Return only the shortened text with no explanations.",
  bullets:
    "Convert the following text into a clean, concise bullet-point list that captures all key ideas. Return only the bullet list with no explanations.",
  continue:
    "Continue writing the following text in the same style, tone, and voice. Add a natural continuation of roughly the same length. Return only the continuation (do not repeat the original) with no explanations.",
  email:
    "Reformat the following message into a complete, professionally structured email. Use a formal salutation (e.g. 'Dear [Recipient],'  -  if no recipient name is obvious, use 'Dear Sir/Madam,'), well-structured paragraphs with correct punctuation, and close with 'Kind regards,' followed by the sender name provided. Return only the formatted email with no explanations.",
};

export async function processWriting(
  text: string,
  mode: WritingMode,
  userName?: string,
): Promise<WritingResult> {
  let instruction = WRITING_MODE_PROMPTS[mode];
  if (mode === "email" && userName) {
    instruction = instruction.replace("the sender name provided", userName);
  }
  const prompt = [instruction, "", "=== TEXT ===", text.trim()].join("\n");

  const maxTokens =
    mode === "expand" || mode === "continue" || mode === "email" ? 800 : 600;
  const result = await requestAiText(prompt, maxTokens, {
    priority: "interactive",
    label: `Writing: ${mode}`,
  });
  return {
    text: result.text ?? null,
    model: result.model,
    error: result.error,
  };
}

// ── Project Summary ───────────────────────────────────────────────────────────

export interface AiProjectSummary {
  headline: string;
  status: string;
  suggestions: string[];
  risks: string[];
}

export interface ProjectSummaryResult {
  summary: AiProjectSummary | null;
  model: string | null;
  error: string | null;
}

function parseProjectSummary(
  text: string,
  name: string,
): AiProjectSummary | null {
  try {
    const parsed = JSON.parse(
      stripMarkdownCodeFence(text),
    ) as Partial<AiProjectSummary>;
    const headline = parsed.headline?.trim() || name;
    const status = parsed.status?.trim();
    if (!status) return null;
    return {
      headline,
      status,
      suggestions: coerceStringList(parsed.suggestions, 4),
      risks: coerceStringList(parsed.risks, 3),
    };
  } catch {
    return null;
  }
}

export async function generateProjectSummary(
  name: string,
  description: string,
  deadline: string | null,
  taskTitles: string[],
  completedCount: number,
  noteTitles: string[],
): Promise<ProjectSummaryResult> {
  const total = taskTitles.length;
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const prompt = [
    "You are Luna, the AI assistant inside Orbit. Analyze this project and provide a concise, actionable brief.",
    "Respond with raw JSON only. No markdown fences. No commentary outside the JSON.",
    "",
    'Required JSON shape: {"headline":"string","status":"string","suggestions":["string"],"risks":["string"]}',
    "",
    "Rules:",
    "- headline: 4-8 words capturing the current project state (e.g. 'On track for Q3 delivery')",
    "- status: 2-3 sentences describing progress, overall health, and notable highlights",
    "- suggestions: 2-4 concrete, actionable next steps tailored to what has been done so far",
    "- risks: 0-3 short risk items only when data suggests a real concern (deadline slippage, stalled tasks, etc.); return [] when there are no clear risks",
    "- Be specific to the project data. Avoid filler and generic advice.",
    "",
    `Project name: ${name}`,
    description ? `Description: ${description}` : "",
    deadline ? `Deadline: ${deadline}` : "No deadline set.",
    `Progress: ${completedCount} of ${total} tasks completed (${progress}%)`,
    total > 0
      ? `Task titles: ${taskTitles.slice(0, 10).join("; ")}`
      : "No tasks linked yet.",
    noteTitles.length > 0
      ? `Related notes: ${noteTitles.slice(0, 5).join("; ")}`
      : "No notes linked yet.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await requestAiText(prompt, 500, {
    priority: "user",
    label: "Project summary",
  });
  if (!result.text) {
    return { summary: null, model: result.model, error: result.error };
  }

  const summary = parseProjectSummary(result.text, name);
  if (!summary) {
    return {
      summary: null,
      model: result.model,
      error: `Luna returned an invalid project summary: ${result.text.slice(0, 180)}`,
    };
  }

  return { summary, model: result.model, error: null };
}

// ── Project color generation ──────────────────────────────────────────────────

export interface GenerateProjectColorResult {
  color: string | null; // hex e.g. "#7c3aed"
  error: string | null;
}

export async function generateProjectColor(
  name: string,
  description: string,
): Promise<GenerateProjectColorResult> {
  const prompt = `You are a design assistant. Generate a single, unique hex color to represent a project named "${name}"${description ? `  -  "${description}"` : ""}.
Rules: return ONLY the hex code (e.g. #7c3aed). Pick a vibrant, saturated color that fits the project theme. Dark-UI safe  -  avoid very bright or very dark colors. No explanations.`;

  const result = await requestAiText(prompt, 10, {
    priority: "user",
    label: "Project color",
    reasoningMode: "fastest",
  });
  if (result.error) return { color: null, error: result.error };

  const match = (result.text ?? "").match(/#[0-9a-fA-F]{6}/);
  return match
    ? { color: match[0].toLowerCase(), error: null }
    : { color: null, error: "Luna couldn't generate a valid color." };
}
