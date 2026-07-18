import { describe, expect, it } from "vitest";
import { resolveMemoryTruth, truthItemForEvidence } from "./memoryTruth";
import type { ScanResult } from "./types";

const scan: ScanResult = {
  root: "/Users/qsh/.codex/memories",
  sources: [
    {
      id: "memory",
      path: "/Users/qsh/.codex/memories/MEMORY.md",
      relativePath: "MEMORY.md",
      kind: "registry",
      modifiedMs: 1,
      bytes: 256,
      lines: 3,
      sha256: "memory-sha",
    },
    {
      id: "correction",
      path: "/Users/qsh/.codex/memories/extensions/ad_hoc/notes/profile.md",
      relativePath: "extensions/ad_hoc/notes/profile.md",
      kind: "adHocNote",
      modifiedMs: 2,
      bytes: 256,
      lines: 3,
      sha256: "correction-sha",
    },
    {
      id: "activity",
      path: "/Users/qsh/.codex/memories/extensions/chronicle/resources/activity.md",
      relativePath: "extensions/chronicle/resources/activity.md",
      kind: "chronicle",
      modifiedMs: 3,
      bytes: 256,
      lines: 3,
      sha256: "activity-sha",
    },
  ],
  entries: [
    {
      id: "profile-old",
      topic: "profile",
      relatedTopics: [],
      title: "Older profile",
      summary: "The user's primary stack is Java/Spring Boot.",
      searchText: "The user's primary stack is Java/Spring Boot.",
      sourcePath: "MEMORY.md",
      startLine: 1,
      endLine: 3,
    },
    {
      id: "profile-correction",
      topic: "overrides",
      relatedTopics: ["profile"],
      title: "Profile correction",
      summary: "The user's primary stack is Python/Rust.",
      searchText: "Memory update request: The user's primary stack is Python/Rust.",
      sourcePath: "extensions/ad_hoc/notes/profile.md",
      startLine: 1,
      endLine: 3,
      change: {
        id: "change-profile",
        operation: "replace",
        targetEntryIds: ["profile-old"],
        revertsChangeId: null,
        createdAt: "2026-07-17T00:00:00.000Z",
      },
    },
    {
      id: "activity",
      topic: "activityLog",
      relatedTopics: [],
      title: "Recent activity",
      summary: "The user inspected BeeBotOS in a recording.",
      searchText: "The user inspected BeeBotOS in a recording.",
      sourcePath: "extensions/chronicle/resources/activity.md",
      startLine: 1,
      endLine: 3,
    },
  ],
  risks: [],
};

describe("resolveMemoryTruth", () => {
  it("promotes correction notes and moves displaced durable memory into review", () => {
    const truth = resolveMemoryTruth(scan);

    expect(truth.current.map((item) => item.entry.id)).toEqual(["profile-correction"]);
    expect(truth.current[0].status).toBe("current");
    expect(truth.current[0].staleCandidates.map((entry) => entry.id)).toEqual(["profile-old"]);
    expect(truth.current[0].decision).toContain("higher-priority correction");
    expect(truth.review.map((item) => [item.entry.id, item.status])).toEqual([
      ["profile-old", "stale"],
      ["activity", "uncertain"],
    ]);
  });

  it("keeps durable memory current when no correction or risk displaces it", () => {
    const truth = resolveMemoryTruth({
      ...scan,
      entries: scan.entries.filter((entry) => entry.id === "profile-old"),
      risks: [],
    });

    expect(truth.current).toHaveLength(1);
    expect(truth.current[0].entry.id).toBe("profile-old");
    expect(truth.review).toHaveLength(0);
  });

  it("keeps unrelated claims current when a correction targets one claim", () => {
    const projectA = {
      ...scan.entries[0],
      id: "project-a",
      topic: "projects" as const,
      title: "Project A",
      summary: "Project A is active.",
    };
    const projectB = {
      ...scan.entries[0],
      id: "project-b",
      topic: "projects" as const,
      title: "Project B",
      summary: "Project B is active.",
    };
    const correction = {
      ...scan.entries[1],
      id: "project-a-correction",
      topic: "overrides" as const,
      relatedTopics: ["projects" as const],
      title: "Project A correction",
      summary: "Project A is archived.",
      change: {
        id: "change-project-a",
        operation: "replace" as const,
        targetEntryIds: ["project-a"],
        revertsChangeId: null,
        createdAt: "2026-07-17T00:00:00.000Z",
      },
    };

    const truth = resolveMemoryTruth({
      ...scan,
      entries: [projectA, projectB, correction],
      risks: [],
    });

    expect(truth.current.map((item) => item.entry.id)).toEqual([
      "project-a-correction",
      "project-b",
    ]);
    expect(truth.review.map((item) => item.entry.id)).toEqual(["project-a"]);
  });

  it("moves deterministic risk entries into the review queue", () => {
    const truth = resolveMemoryTruth({
      ...scan,
      entries: scan.entries.filter((entry) => entry.id === "profile-old"),
      risks: [
        {
          id: "risk-profile",
          kind: "staleConflict",
          title: "Stack conflict",
          detail: "Older Java/Spring Boot text conflicts with a newer correction.",
          entryId: "profile-old",
        },
      ],
    });

    expect(truth.current).toHaveLength(0);
    expect(truth.review).toHaveLength(1);
    expect(truth.review[0]).toMatchObject({
      status: "conflict",
      decision: "Stack conflict",
      reviewReason: "Older Java/Spring Boot text conflicts with a newer correction.",
    });
  });

  it("restores a targeted claim after its replacement is reverted", () => {
    const replacement = scan.entries[1];
    const revert = {
      ...replacement,
      id: "profile-revert",
      title: "Revert profile correction",
      change: {
        id: "change-profile-revert",
        operation: "revert" as const,
        targetEntryIds: [],
        revertsChangeId: replacement.change!.id,
        createdAt: "2026-07-18T00:00:00.000Z",
      },
    };
    const truth = resolveMemoryTruth({
      ...scan,
      entries: [scan.entries[0], replacement, revert],
      risks: [],
    });

    expect(truth.current.map((item) => item.entry.id)).toEqual(["profile-old"]);
    expect(truth.review.map((item) => item.entry.id)).toEqual(["profile-correction"]);
  });

  it("uses the latest correction as the winner for a repeatedly corrected claim", () => {
    const olderCorrection = {
      ...scan.entries[1],
      id: "profile-correction-older",
      title: "Older profile correction",
      change: {
        ...scan.entries[1].change!,
        id: "change-profile-older",
        createdAt: "2026-07-16T00:00:00.000Z",
      },
    };
    const newerCorrection = {
      ...scan.entries[1],
      id: "profile-correction-newer",
      title: "Newer profile correction",
      change: {
        ...scan.entries[1].change!,
        id: "change-profile-newer",
        createdAt: "2026-07-18T00:00:00.000Z",
      },
    };
    const truth = resolveMemoryTruth({
      ...scan,
      entries: [scan.entries[0], newerCorrection, olderCorrection],
      risks: [{
        id: "risk-older-correction",
        kind: "staleConflict",
        title: "Superseded correction",
        detail: "A newer correction targets the same claim.",
        entryId: olderCorrection.id,
      }],
    });

    expect(truth.current.map((item) => item.entry.id)).toEqual([newerCorrection.id]);
    expect(truth.review.find((item) => item.entry.id === "profile-old")?.decision)
      .toContain("Newer profile correction");
  });

  it("maps profile evidence ranges back to truth status", () => {
    const truth = resolveMemoryTruth(scan);

    expect(
      truthItemForEvidence(truth, {
        entryId: "profile-correction",
        sourcePath: "extensions/ad_hoc/notes/profile.md",
        startLine: 1,
        endLine: 3,
        summary: "The user's primary stack is Python/Rust.",
      })?.status,
    ).toBe("current");
    expect(
      truthItemForEvidence(truth, {
        entryId: "profile-old",
        sourcePath: "MEMORY.md",
        startLine: 1,
        endLine: 3,
        summary: "The user's primary stack is Java/Spring Boot.",
      })?.status,
    ).toBe("stale");
    expect(
      truthItemForEvidence(truth, {
        entryId: "activity",
        sourcePath: "extensions/chronicle/resources/activity.md",
        startLine: 1,
        endLine: 3,
        summary: "The user inspected BeeBotOS in a recording.",
      })?.status,
    ).toBe("uncertain");
  });
});
