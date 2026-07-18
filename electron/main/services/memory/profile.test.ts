import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MemoryEntry, MemoryProfile, MemorySource } from "../../../../src/lib/types";
import {
  currentMemoryEntries,
  loadMemoryProfileForRoot,
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

  it("returns the last successful Codex profile even when source memory changed", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-profile-"));
    temporaryRoots.push(root);
    const cachePath = memoryProfileCachePath(root, "zh-CN");
    const cached: MemoryProfile = {
      schemaVersion: "1",
      generatedAt: "2026-07-17T00:00:00.000Z",
      sourceHash: "previous-source-hash",
      generator: "codex-profile-v4",
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
});
