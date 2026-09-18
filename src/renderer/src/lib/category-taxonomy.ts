export type CategoryKind = "task" | "note";

export interface CategoryInput {
  id: string;
  title: string;
  context?: string | null;
}

export interface CategoryAssignment {
  id: string;
  category: string;
}

export const CATEGORY_BATCH_SIZE = 30;

const TASK_FALLBACK_CATEGORIES = [
  "Work",
  "Personal",
  "Health & Fitness",
  "Finance",
  "Learning",
  "Shopping",
  "Home & Household",
  "Social",
  "Creative",
  "Admin & Errands",
  "Travel",
  "Career",
  "Relationships",
  "Self-Care",
  "Technology",
  "Meals & Cooking",
  "Events & Planning",
] as const;

const NOTE_FALLBACK_CATEGORIES = [
  "Work",
  "Personal",
  "Ideas",
  "Research",
  "Learning",
  "Journal",
  "Health",
  "Finance",
  "Reference",
  "Projects",
  "Meeting Notes",
  "Creative",
  "Travel",
  "Recipes",
  "Goals",
] as const;

export function normalizeCategoryLabel(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/[.!?,:;]+$/g, "")
    .replace(/\s+/g, " ");
}

function appendUniqueCategory(target: string[], value: string): void {
  const cleaned = normalizeCategoryLabel(value);
  if (!cleaned) return;
  const key = cleaned.toLocaleLowerCase();
  if (target.some((category) => category.toLocaleLowerCase() === key)) return;
  target.push(cleaned);
}

export function getCategoryPool(
  kind: CategoryKind,
  existingCategories: readonly string[],
): { existing: string[]; allowed: string[] } {
  const existing: string[] = [];
  for (const category of existingCategories) appendUniqueCategory(existing, category);

  const allowed = [...existing];
  const fallbacks =
    kind === "task" ? TASK_FALLBACK_CATEGORIES : NOTE_FALLBACK_CATEGORIES;
  for (const category of fallbacks) appendUniqueCategory(allowed, category);

  return { existing, allowed };
}

export function usesStableCategoryTaxonomy(
  kind: CategoryKind,
  categories: readonly string[],
): boolean {
  const stable = new Set(
    getCategoryPool(kind, []).allowed.map((category) => category.toLocaleLowerCase()),
  );
  return categories.every((category) =>
    stable.has(normalizeCategoryLabel(category).toLocaleLowerCase()),
  );
}

export function buildCategorizationRequest(
  kind: CategoryKind,
  items: readonly CategoryInput[],
  existingCategories: readonly string[],
): { prompt: string; outputSchema: Record<string, unknown>; allowed: string[] } {
  const { existing, allowed } = getCategoryPool(kind, existingCategories);
  const noun = kind === "task" ? "task" : "note";
  const contextLabel = kind === "task" ? "description" : "content excerpt";
  const payload = items.map((item) => ({
    id: item.id,
    title: item.title,
    [contextLabel]: item.context?.slice(0, 500) || "",
  }));

  const prompt = [
    `Categorize every ${noun} in the JSON input using one exact label from the allowed taxonomy.`,
    "This is taxonomy maintenance, not creative naming.",
    "",
    "Rules:",
    "1. Return one assignment for every input ID, with no missing or duplicate IDs.",
    "2. Reuse a current category whenever it is even reasonably applicable.",
    "3. Treat close synonyms and narrower variants as the same category. Prefer the broader reusable label.",
    "4. Use a fallback category only when no current category fits.",
    "5. Copy category labels exactly. Never invent, rename, combine, or pluralize a label.",
    "6. Categorize by the item's actual purpose, not an incidental word.",
    "7. Return only the JSON required by the response schema.",
    "",
    existing.length > 0
      ? `Current categories, highest priority: ${JSON.stringify(existing)}`
      : "Current categories: none yet",
    `Allowed taxonomy: ${JSON.stringify(allowed)}`,
    "",
    `Input ${noun}s:`,
    JSON.stringify(payload),
  ].join("\n");

  const ids = items.map((item) => item.id);
  const outputSchema: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    properties: {
      assignments: {
        type: "array",
        minItems: items.length,
        maxItems: items.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", enum: ids },
            category: { type: "string", enum: allowed },
          },
          required: ["id", "category"],
        },
      },
    },
    required: ["assignments"],
  };

  return { prompt, outputSchema, allowed };
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseCategorizationResponse(
  text: string,
  items: readonly CategoryInput[],
  allowedCategories: readonly string[],
): CategoryAssignment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownCodeFence(text));
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") return [];
  const assignments = (parsed as { assignments?: unknown }).assignments;
  if (!Array.isArray(assignments)) return [];

  const expectedIds = new Set(items.map((item) => item.id));
  const allowedByKey = new Map(
    allowedCategories.map((category) => [category.toLocaleLowerCase(), category]),
  );
  const seenIds = new Set<string>();
  const result: CategoryAssignment[] = [];

  for (const assignment of assignments) {
    if (!assignment || typeof assignment !== "object") continue;
    const candidate = assignment as { id?: unknown; category?: unknown };
    if (typeof candidate.id !== "string" || !expectedIds.has(candidate.id)) continue;
    if (seenIds.has(candidate.id) || typeof candidate.category !== "string") continue;

    const normalized = normalizeCategoryLabel(candidate.category).toLocaleLowerCase();
    const category = allowedByKey.get(normalized);
    if (!category) continue;

    seenIds.add(candidate.id);
    result.push({ id: candidate.id, category });
  }

  return result;
}

export function chunkCategoryInputs(
  items: readonly CategoryInput[],
  size = CATEGORY_BATCH_SIZE,
): CategoryInput[][] {
  const chunks: CategoryInput[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
