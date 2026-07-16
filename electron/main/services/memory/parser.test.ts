import { describe, expect, it } from "vitest";
import { parseEntries } from "./parser";

describe("memory parser parity", () => {
  it("classifies current correction notes and preserves full search text", () => {
    const entries = parseEntries(
      "extensions/ad_hoc/notes/profile.md",
      "Memory update request:\n\n- `dilidili` is no longer active.\n- The user's primary technical stack has shifted to Python/Rust.\n",
    );
    expect(entries[0].topic).toBe("overrides");
    expect(entries[0].relatedTopics).toEqual(expect.arrayContaining(["projects", "profile"]));
    expect(entries[0].searchText).toContain("Python/Rust");
  });

  it("keeps history out of current project topics and skips metadata", () => {
    const history = parseEntries(
      "rollout_summaries/example.md",
      "## Task Group\n\nThe user reviewed the BeeBotOS project.\n",
    );
    expect(history.every((entry) => entry.topic === "activityLog")).toBe(true);

    const registry = parseEntries(
      "MEMORY.md",
      "# Task Group\nscope: internal\napplies_to: cwd=/tmp\n\n## User preferences\n\n- when the user asks, inspect real files\n",
    );
    expect(registry.some((entry) => entry.summary.startsWith("when the user asks"))).toBe(true);
    expect(registry.some((entry) => entry.summary.includes("scope:"))).toBe(false);
  });
});
