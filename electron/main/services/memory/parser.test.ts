import { describe, expect, it } from "vitest";
import { parseEntries } from "./parser";

describe("memory parser parity", () => {
  it("splits current correction notes into independently reviewable claims", () => {
    const entries = parseEntries(
      "extensions/ad_hoc/notes/profile.md",
      "Memory update request:\n\n- `dilidili` is no longer active.\n- The user's primary technical stack has shifted to Python/Rust.\n",
    );
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.topic === "overrides")).toBe(true);
    expect(entries[0].relatedTopics).toContain("projects");
    expect(entries[1].relatedTopics).toContain("profile");
    expect(entries[1].searchText).toContain("Python/Rust");
    expect(entries[0].id).not.toBe(entries[1].id);
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

  it("preserves targeted change metadata as part of the parsed claim", () => {
    const metadata = {
      id: "change-a",
      operation: "replace",
      targetEntryIds: ["claim-a"],
      revertsChangeId: null,
      createdAt: "2026-07-17T00:00:00.000Z",
    };
    const [entry] = parseEntries(
      "extensions/ad_hoc/notes/change-a.md",
      `## Agent Backplane change change-a\n\n<!-- agent-backplane-change ${JSON.stringify(metadata)} -->\n\nMemory update request:\n\n- Project A is archived.\n`,
    );

    expect(entry.change).toEqual(metadata);
    expect(entry.summary).toBe("Project A is archived.");
  });

  it("keeps nested list content with its parent and preserves legacy block aliases", () => {
    const text = [
      "## Preferences",
      "",
      "- Verify current source before answering.",
      "  - Include exact paths.",
      "  Continued explanation.",
      "- Reply in Chinese.",
      "",
    ].join("\n");
    const entries = parseEntries("MEMORY.md", text, "registry");
    const [legacy] = parseEntries("MEMORY.md", text, "raw");

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      claimKind: "listItem",
      startLine: 3,
      endLine: 5,
    });
    expect(entries[0].searchText).toContain("Include exact paths");
    expect(entries[1]).toMatchObject({ startLine: 6, endLine: 6 });
    expect(entries.every((entry) => entry.aliasIds?.includes(legacy.id))).toBe(true);
  });

  it("keeps unchanged atomic IDs across insertion and reordering", () => {
    const initial = parseEntries(
      "MEMORY.md",
      "## Projects\n\n- Project A is active.\n- Project B is archived.\n",
      "registry",
    );
    const reordered = parseEntries(
      "MEMORY.md",
      "## Projects\n\n- Project C is planned.\n- Project B is archived.\n- Project A is active.\n",
      "registry",
    );

    const ids = new Map(initial.map((entry) => [entry.summary, entry.id]));
    expect(reordered.find((entry) => entry.summary === "Project A is active.")?.id)
      .toBe(ids.get("Project A is active."));
    expect(reordered.find((entry) => entry.summary === "Project B is archived.")?.id)
      .toBe(ids.get("Project B is archived."));
  });

  it("does not reuse a transient claim ID for identical text in different blocks", () => {
    const entries = parseEntries(
      "MEMORY.md",
      "# First\n\n- Reply in Chinese.\n\n## Second\n\n- Reply in Chinese.\n",
      "registry",
    );

    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
  });

  it("keeps a multi-line marked correction as one change entry", () => {
    const metadata = {
      schemaVersion: "2",
      id: "change-multi",
      operation: "replace",
      targetEntryIds: ["claim-a", "claim-b"],
      revertsChangeId: null,
      createdAt: "2026-07-17T00:00:00.000Z",
      targetRevisions: { "claim-a": "rev-a", "claim-b": "rev-b" },
    };
    const entries = parseEntries(
      "extensions/ad_hoc/notes/change-multi.md",
      `## Agent Backplane change change-multi\n\n<!-- agent-backplane-change ${JSON.stringify(metadata)} -->\n\nMemory update request:\n\n- Project A is archived.\n- Project B is active.\n`,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].searchText).toContain("Project B is active");
    expect(entries[0].change).toEqual(metadata);
  });
});
