import { describe, expect, it } from "vitest";
import { createCodexInitializeParams } from "./codex-protocol";

describe("Codex app-server protocol", () => {
  it("opts into the experimental fields used by Orbit completions", () => {
    expect(createCodexInitializeParams("0.1.0")).toEqual({
      clientInfo: {
        name: "orbit-desktop",
        title: "Orbit Desktop",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
  });
});
