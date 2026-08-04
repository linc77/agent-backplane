import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MemoryEntry, MemoryProfile, MemorySource } from "../../../../src/lib/types";
import {
  canonicalizeMemoryProfileEvidence,
  currentMemoryEntries,
  loadMemoryProfileForRoot,
  memoryProfileEntryExcerpts,
  memoryProfileCachePath,
  memoryProfileSourceHash,
} from "./profile";

const temporaryRoots: string[] = [];

function source(relativePath: string, sha256: string): MemorySource {
  return {
    id: relativePath,
    path: `/tmp/${relativePath}`,
    relativePath,
    kind: relativePath.includes("extensions/") ? "adHocNote" : "registry",
    modifiedMs: 1,
    bytes: 20,
    lines: 4,
    sha256,
  };
}

function entry(
  id: string,
  sourcePath: string,
  summary: string,
  change?: MemoryEntry["change"],
): MemoryEntry {
  return {
    id,
    topic: change ? "overrides" : "profile",
    relatedTopics: change ? ["profile"] : [],
    title: id,
    summary,
    searchText: summary,
    sourcePath,
    startLine: 1,
    endLine: 4,
    change,
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("AI memory profile cache", () => {
  it("hashes only the effective memory sources", () => {
    const sources = [
      source("MEMORY.md", "old"),
      source("extensions/ad_hoc/notes/change.md", "new"),
      source("unused.md", "unused"),
    ];
    const entries = [
      entry("old-profile", "MEMORY.md", "Old profile"),
      entry(
        "new-profile",
        "extensions/ad_hoc/notes/change.md",
        "New profile",
        {
          id: "change-profile",
          operation: "replace",
          targetEntryIds: ["old-profile"],
          revertsChangeId: null,
          createdAt: "2026-07-17T00:00:00.000Z",
        },
      ),
    ];

    const current = currentMemoryEntries(sources, entries, []);
    expect(current.map((item) => item.id)).toEqual(["new-profile"]);
    expect(memoryProfileSourceHash(sources, current)).toBe(
      memoryProfileSourceHash([sources[1]], current),
    );
  });

  it("does not invalidate a profile for source-only formatting changes", () => {
    const stableEntry = {
      ...entry("stable-profile", "MEMORY.md", "Stable profile"),
      revisionHash: "stable-revision",
    };

    expect(memoryProfileSourceHash([source("MEMORY.md", "before")], [stableEntry])).toBe(
      memoryProfileSourceHash([source("MEMORY.md", "after")], [stableEntry]),
    );
  });

  it("returns the last successful Codex profile even when source memory changed", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-profile-"));
    temporaryRoots.push(root);
    const cachePath = memoryProfileCachePath(root, "zh-CN");
    const cached: MemoryProfile = {
      schemaVersion: "1",
      generatedAt: "2026-07-17T00:00:00.000Z",
      sourceHash: "previous-source-hash",
      generator: "codex-profile-v7",
      cachePath,
      sections: [
        {
          id: "durable-profile",
          title: "稳定画像",
          body: "这是上次成功生成的画像。",
          evidence: [
            { entryId: "profile", sourcePath: "MEMORY.md", startLine: 1, endLine: 4, summary: "Evidence" },
          ],
          confidence: "high",
          stability: "stable",
        },
      ],
      metadata: { memoryRoot: root, inputEntries: 1, currentEntries: 1 },
    };
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(cached));
    const sources = [source("MEMORY.md", "changed")];
    const entries = [entry("profile", "MEMORY.md", "Changed profile")];

    const result = await loadMemoryProfileForRoot(root, "zh-CN", sources, entries, []);

    expect(result.profile?.sections[0].body).toBe("这是上次成功生成的画像。");
    expect(result.profileStale).toBe(true);
    expect(result.sourceHash).not.toBe(cached.sourceHash);
  });

  it("ignores rule-generated and locale-mismatched cache files", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-profile-"));
    temporaryRoots.push(root);
    const legacyPath = join(root, ".backplane", "profile.json");
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, JSON.stringify({ generator: "deterministic-profile-v4" }));

    const result = await loadMemoryProfileForRoot(
      root,
      "en-US",
      [source("MEMORY.md", "current")],
      [entry("profile", "MEMORY.md", "Current profile")],
      [],
    );

    expect(result.profile).toBeNull();
    expect(result.profileStale).toBe(false);
    expect(result.sourceHash).toHaveLength(64);
  });

  it("invalidates v5 profiles that contain pre-atomic evidence IDs", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-profile-"));
    temporaryRoots.push(root);
    const cachePath = memoryProfileCachePath(root, "zh-CN");
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify({
      schemaVersion: "1",
      generatedAt: "2026-07-17T00:00:00.000Z",
      sourceHash: "old",
      generator: "codex-profile-v5",
      sections: [],
      metadata: { memoryRoot: root, inputEntries: 1, currentEntries: 1 },
    }));

    const result = await loadMemoryProfileForRoot(
      root,
      "zh-CN",
      [source("MEMORY.md", "current")],
      [entry("profile", "MEMORY.md", "Current profile")],
      [],
    );

    expect(result.profile).toBeNull();
  });

  it("keeps later section facts in the profile input within a fixed total budget", () => {
    const entries = Array.from({ length: 50 }, (_, index) => ({
      ...entry(`entry-${index}`, "MEMORY.md", `First fact ${index}`),
      searchText: `# Section ${index}\n- First fact ${index}\n- Later fact ${index}\n${"x".repeat(2_000)}`,
    }));

    const excerpts = memoryProfileEntryExcerpts(entries);

    expect(excerpts.get("entry-0")).toContain("Later fact 0");
    expect([...excerpts.values()].reduce((total, value) => total + [...value].length, 0))
      .toBeLessThanOrEqual(48_000);
  });

  it("uses a short model reference and restores canonical evidence metadata", () => {
    const canonicalEntry = {
      ...entry("stable-claim-id", "MEMORY.md", "Canonical evidence summary"),
      startLine: 21,
      endLine: 23,
    };
    const profile: MemoryProfile = {
      schemaVersion: "1",
      generatedAt: "model-value",
      sourceHash: "model-value",
      generator: "model-value",
      cachePath: "model-value",
      sections: [{
        id: "working-style",
        title: "工作方式",
        body: "偏好直接、可验证的协作。",
        evidence: [{
          entryId: "C001",
          sourcePath: "model-guessed.md",
          startLine: 1,
          endLine: 1,
          summary: "Model-generated summary",
        }],
        confidence: "high",
        stability: "stable",
      }],
      metadata: { memoryRoot: "/tmp", inputEntries: 1, currentEntries: 1 },
    };

    const canonical = canonicalizeMemoryProfileEvidence(
      profile,
      new Map([["C001", canonicalEntry]]),
    );

    expect(canonical.sections[0].evidence[0]).toEqual({
      entryId: "stable-claim-id",
      sourcePath: "MEMORY.md",
      startLine: 21,
      endLine: 23,
      summary: "Model-generated summary",
    });
  });

  it("still rejects evidence references that do not map to a real claim", () => {
    const profile: MemoryProfile = {
      schemaVersion: "1",
      generatedAt: "model-value",
      sourceHash: "model-value",
      generator: "model-value",
      cachePath: "model-value",
      sections: [{
        id: "working-style",
        title: "工作方式",
        body: "偏好直接、可验证的协作。",
        evidence: [{
          entryId: "C999",
          sourcePath: "MEMORY.md",
          startLine: 1,
          endLine: 1,
          summary: "Unknown evidence",
        }],
        confidence: "high",
        stability: "stable",
      }],
      metadata: { memoryRoot: "/tmp", inputEntries: 1, currentEntries: 1 },
    };

    expect(() => canonicalizeMemoryProfileEvidence(profile, new Map()))
      .toThrow("unknown or duplicate memory evidence reference: C999");
  });
});
