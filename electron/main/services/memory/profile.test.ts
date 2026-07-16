import { describe, expect, it } from "vitest";
import type { MemoryEntry, MemorySource } from "../../../../src/lib/types";
import { buildMemoryProfileWithoutCache } from "./profile";

describe("deterministic memory profile", () => {
  it("deduplicates repeated observation titles", () => {
    const sources: MemorySource[] = ["one.md", "two.md"].map((relativePath, index) => ({
      id: String(index),
      path: `/tmp/${relativePath}`,
      relativePath,
      kind: "registry",
      modifiedMs: index,
      bytes: 10,
      lines: 2,
      sha256: relativePath,
    }));
    const entries: MemoryEntry[] = sources.map((source, index) => ({
      id: `entry-${index}`,
      topic: "rules",
      relatedTopics: [],
      title: `Rule ${index}`,
      summary: "The user wants collaboration rules to become executable behavior.",
      searchText: "The user wants collaboration rules to become executable behavior.",
      sourcePath: source.relativePath,
      startLine: 1,
      endLine: 2,
    }));
    const profile = buildMemoryProfileWithoutCache("/tmp", sources, entries, []);
    expect(new Set(profile.sections.map((section) => section.title)).size).toBe(profile.sections.length);
  });
});
