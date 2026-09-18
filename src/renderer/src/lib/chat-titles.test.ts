import { describe, expect, it } from "vitest";
import { CHAT_TITLE_MAX_LENGTH, fallbackChatTitle } from "./ai-client";

describe("chat title fallback", () => {
  it("names an empty chat rather than returning an empty string", () => {
    expect(fallbackChatTitle("")).toBe("New chat");
    expect(fallbackChatTitle("   \n  ")).toBe("New chat");
  });

  it("keeps a short message verbatim and flattens its whitespace", () => {
    expect(fallbackChatTitle("Plan the  Q3\nlaunch")).toBe("Plan the Q3 launch");
  });

  it("truncates at a word boundary and never exceeds the cap", () => {
    const long =
      "Help me decide whether to move the launch checklist into a project or keep it as tasks";
    const title = fallbackChatTitle(long);

    expect(title.length).toBeLessThanOrEqual(CHAT_TITLE_MAX_LENGTH + 1); // + ellipsis
    expect(title.endsWith("…")).toBe(true);
    // Cut between words, so the last word is never sliced in half.
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });

  it("falls back to a hard cut when the first word is longer than the cap", () => {
    const title = fallbackChatTitle("z".repeat(80));
    expect(title).toBe(`${"z".repeat(CHAT_TITLE_MAX_LENGTH)}…`);
  });
});
