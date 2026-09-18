import { describe, expect, it } from "vitest";
import {
  getFastestReasoningEffort,
  mapCodexModel,
  resolveModelSelection,
} from "./ai-models";
import type { CodexModel } from "../../../shared/contracts";

const model: CodexModel = {
  id: "gpt-example",
  model: "gpt-example",
  displayName: "GPT Example",
  description: "A test model",
  hidden: false,
  defaultReasoningEffort: "medium",
  isDefault: true,
  supportedReasoningEfforts: [
    { reasoningEffort: "low", description: "Fast" },
    { reasoningEffort: "medium", description: "Balanced" },
    { reasoningEffort: "max", description: "Deep" },
    { reasoningEffort: "ultra", description: "Beyond the Orbit control range" },
  ],
};

describe("Codex model settings", () => {
  it("maps live Codex models into the desktop selector and caps the slider at max", () => {
    const mapped = mapCodexModel(model);

    expect(mapped.label).toBe("GPT Example");
    expect(mapped.recommended).toBe(true);
    expect(mapped.supportedReasoningEfforts.map((option) => option.reasoningEffort)).toEqual([
      "low",
      "medium",
      "max",
    ]);
  });

  it("keeps a supported choice and falls back to the live model default", () => {
    const mapped = mapCodexModel(model);

    expect(resolveModelSelection([mapped], "gpt-example", "max")).toEqual({
      model: "gpt-example",
      effort: "max",
    });
    expect(resolveModelSelection([mapped], "missing-model", "ultra")).toEqual({
      model: "gpt-example",
      effort: "medium",
    });
  });

  it("uses none when advertised and otherwise selects the lowest supported effort", () => {
    const mapped = mapCodexModel(model);
    expect(getFastestReasoningEffort(mapped)).toBe("low");
    expect(getFastestReasoningEffort({
      ...mapped,
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "Balanced" },
        { reasoningEffort: "none", description: "No reasoning" },
        { reasoningEffort: "low", description: "Fast" },
      ],
    })).toBe("none");
  });
});
