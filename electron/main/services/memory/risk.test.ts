import { describe, expect, it } from "vitest";
import type { MemoryEntry } from "../../../../src/lib/types";
import { detectRisks } from "./risk";

function changeEntry(id: string, createdAt: string, targetEntryIds = ["project-a"]): MemoryEntry {
  return {
    id,
    topic: "overrides",
    relatedTopics: ["projects"],
    title: id,
    summary: id,
    searchText: id,
    sourcePath: `${id}.md`,
    startLine: 1,
    endLine: 1,
    change: {
      id,
      operation: "replace",
      targetEntryIds,
      revertsChangeId: null,
      createdAt,
    },
  };
}

describe("memory structural risks", () => {
  it("marks an older targeted correction when a newer change owns the same claim", () => {
    const original: MemoryEntry = {
      ...changeEntry("project-a", "2026-07-15T00:00:00.000Z"),
      topic: "projects",
      relatedTopics: [],
      change: undefined,
    };
    const risks = detectRisks([
      original,
      changeEntry("change-old", "2026-07-16T00:00:00.000Z"),
      changeEntry("change-new", "2026-07-17T00:00:00.000Z"),
    ]);
    expect(risks).toEqual([
      expect.objectContaining({ kind: "coveredByOverride", entryId: "change-old" }),
    ]);
  });

  it("reports a targeted correction whose claim disappeared", () => {
    const risks = detectRisks([changeEntry("change-orphan", "2026-07-17T00:00:00.000Z")]);
    expect(risks[0]).toMatchObject({ kind: "staleConflict", entryId: "change-orphan" });
  });

  it("resolves a legacy block alias to all atomic claims without reporting a missing target", () => {
    const projectA: MemoryEntry = {
      ...changeEntry("project-a", "2026-07-15T00:00:00.000Z"),
      aliasIds: ["legacy-project-block"],
      topic: "projects",
      relatedTopics: [],
      change: undefined,
    };
    const projectB: MemoryEntry = {
      ...projectA,
      id: "project-b",
      title: "Project B",
      summary: "Project B is active.",
      aliasIds: ["legacy-project-block"],
    };

    expect(detectRisks([
      projectA,
      projectB,
      changeEntry("change-legacy", "2026-07-17T00:00:00.000Z", ["legacy-project-block"]),
    ])).toEqual([]);
  });

  it("uses revision evidence only as a unique recovery path", () => {
    const original: MemoryEntry = {
      ...changeEntry("new-stable-id", "2026-07-15T00:00:00.000Z"),
      revisionHash: "revision-a",
      topic: "projects",
      relatedTopics: [],
      change: undefined,
    };
    const correction = changeEntry("change-recovered", "2026-07-17T00:00:00.000Z", ["lost-stable-id"]);
    correction.change = {
      ...correction.change!,
      schemaVersion: "2",
      targetRevisions: { "lost-stable-id": "revision-a" },
    };

    expect(detectRisks([original, correction])).toEqual([]);
  });
});
