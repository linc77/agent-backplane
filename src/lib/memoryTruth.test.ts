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

  it("maps profile evidence ranges back to truth status", () => {
    const truth = resolveMemoryTruth(scan);

    expect(
      truthItemForEvidence(truth, {
        sourcePath: "extensions/ad_hoc/notes/profile.md",
        startLine: 1,
        endLine: 3,
        summary: "The user's primary stack is Python/Rust.",
      })?.status,
    ).toBe("current");
    expect(
      truthItemForEvidence(truth, {
        sourcePath: "MEMORY.md",
        startLine: 1,
        endLine: 3,
        summary: "The user's primary stack is Java/Spring Boot.",
      })?.status,
    ).toBe("stale");
    expect(
      truthItemForEvidence(truth, {
        sourcePath: "extensions/chronicle/resources/activity.md",
        startLine: 1,
        endLine: 3,
        summary: "The user inspected BeeBotOS in a recording.",
      })?.status,
    ).toBe("uncertain");
  });
});
