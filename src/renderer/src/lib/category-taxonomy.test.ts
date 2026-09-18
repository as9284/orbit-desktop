import { describe, expect, it } from "vitest";
import {
  buildCategorizationRequest,
  chunkCategoryInputs,
  getCategoryPool,
  parseCategorizationResponse,
  usesStableCategoryTaxonomy,
  type CategoryInput,
} from "./category-taxonomy";

const items: CategoryInput[] = [
  { id: "one", title: "Prepare client update", context: "Weekly status" },
  { id: "two", title: "Send the invoice", context: "September billing" },
];

describe("category taxonomy", () => {
  it("puts the existing taxonomy first and removes case-only duplicates", () => {
    const pool = getCategoryPool("task", ["Clients", "work", "Clients"]);

    expect(pool.existing).toEqual(["Clients", "work"]);
    expect(pool.allowed.slice(0, 3)).toEqual(["Clients", "work", "Personal"]);
    expect(pool.allowed.filter((category) => category.toLowerCase() === "work")).toHaveLength(1);
  });

  it("detects legacy free-form categories that need a controlled rebuild", () => {
    expect(usesStableCategoryTaxonomy("task", ["Work", "Shopping"])).toBe(true);
    expect(usesStableCategoryTaxonomy("task", ["Work", "Urgent Client Stuff"])).toBe(false);
  });

  it("constrains structured output to known IDs and allowed labels", () => {
    const request = buildCategorizationRequest("task", items, ["Clients"]);
    const properties = request.outputSchema.properties as Record<string, unknown>;
    const assignments = properties.assignments as {
      minItems: number;
      maxItems: number;
      items: { properties: Record<string, { enum: string[] }> };
    };

    expect(assignments.minItems).toBe(2);
    expect(assignments.maxItems).toBe(2);
    expect(assignments.items.properties.id.enum).toEqual(["one", "two"]);
    expect(assignments.items.properties.category.enum[0]).toBe("Clients");
    expect(request.prompt).toContain("Never invent, rename, combine, or pluralize a label.");
  });

  it("canonicalizes valid labels and rejects invented labels or duplicate IDs", () => {
    const parsed = parseCategorizationResponse(
      JSON.stringify({
        assignments: [
          { id: "one", category: "clients" },
          { id: "one", category: "Work" },
          { id: "two", category: "Random New Bucket" },
        ],
      }),
      items,
      ["Clients", "Work"],
    );

    expect(parsed).toEqual([{ id: "one", category: "Clients" }]);
  });

  it("caps a single AI request at thirty items", () => {
    const manyItems = Array.from({ length: 61 }, (_, index) => ({
      id: String(index),
      title: `Item ${index}`,
    }));

    expect(chunkCategoryInputs(manyItems).map((chunk) => chunk.length)).toEqual([30, 30, 1]);
  });
});
