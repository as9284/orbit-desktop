import { describe, expect, it } from "vitest";
import {
  getFastestReasoningEffort,
  mapCodexModel,
  resolveModelSelection,
  ORBIT_DEFAULT_MODEL_ID,
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

  it("prefers Orbit's default model over the one Codex marks as default", () => {
    const astra = mapCodexModel({
      ...model,
      id: "gpt-6-astra",
      model: "gpt-6-astra",
      displayName: "GPT-6-Astra",
      isDefault: true,
    });
    const luna = mapCodexModel({
      ...model,
      id: ORBIT_DEFAULT_MODEL_ID,
      model: ORBIT_DEFAULT_MODEL_ID,
      displayName: "GPT-5.6-Luna",
      isDefault: false,
    });

    // No saved choice yet: Orbit's preference wins over Codex's isDefault.
    expect(resolveModelSelection([astra, luna], "", "").model).toBe(
      ORBIT_DEFAULT_MODEL_ID,
    );
    // A saved choice always wins over both.
    expect(resolveModelSelection([astra, luna], "gpt-6-astra", "").model).toBe(
      "gpt-6-astra",
    );
    // Preference missing from the live catalog falls back to Codex's default.
    expect(resolveModelSelection([astra], "", "").model).toBe("gpt-6-astra");
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
