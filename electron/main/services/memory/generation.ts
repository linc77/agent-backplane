import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { MemoryProfile, MemoryProfileGenerationTask } from "../../../../src/lib/types";
import { BackgroundTaskManager } from "../backgroundTask";
import { runCodexExec } from "../codex";
import { isoNow } from "../shared";
import { resolveMemoryRoot } from "./paths";
import { buildMemoryProfileWithoutCache } from "./profile";
import { scanMemories } from "./index";

function schemaPath() {
  const candidates = [
    join(process.cwd(), "schemas", "memory-profile.schema.json"),
    join(process.resourcesPath, "schemas", "memory-profile.schema.json"),
  ];
  const path = candidates.find(existsSync);
  if (!path) throw new Error("memory profile schema is unavailable");
  return path;
}

function normalizeProfile(profile: MemoryProfile, base: MemoryProfile): MemoryProfile {
  return {
    ...profile,
    schemaVersion: "1",
    generatedAt: isoNow(),
    sourceHash: base.sourceHash,
    generator: "codex-profile-v1",
    cachePath: base.cachePath,
    metadata: base.metadata,
  };
}

function validateProfile(profile: MemoryProfile, sourcePaths: Set<string>) {
  if (!Array.isArray(profile.sections) || profile.sections.length > 8) {
    throw new Error("codex exec returned an invalid memory profile");
  }
  for (const section of profile.sections) {
    if (!section.id || !section.title || !section.body || !section.evidence.length) {
      throw new Error("codex exec returned an incomplete memory profile section");
    }
    for (const evidence of section.evidence) {
      if (!sourcePaths.has(evidence.sourcePath) || evidence.startLine < 1 || evidence.endLine < evidence.startLine) {
        throw new Error("codex exec returned invalid memory profile evidence");
      }
    }
  }
}

export async function generateMemoryProfile(rootOverride?: string | null, signal?: AbortSignal) {
  const root = resolveMemoryRoot(rootOverride);
  const scan = await scanMemories(root);
  const base = buildMemoryProfileWithoutCache(root, scan.sources, scan.entries, scan.risks);
  const bundle = {
    schemaVersion: "1",
    memoryRoot: root,
    generatedAt: isoNow(),
    sourceHash: base.sourceHash,
    risks: scan.risks,
    entries: scan.entries.map((entry) => ({ ...entry, searchText: [...entry.searchText].slice(0, 12_000).join("") })),
  };
  try {
    const output = await runCodexExec({
      cwd: tmpdir(),
      schemaPath: schemaPath(),
      signal,
      stdin: JSON.stringify(bundle),
      prompt: "Analyze this Agent Memory Manager bundle from stdin and return only the Memory Profile JSON. Write natural Chinese, discover durable themes from evidence, use specific observation titles, and never invent evidence paths or line ranges.",
    });
    const profile = normalizeProfile(JSON.parse(output) as MemoryProfile, base);
    validateProfile(profile, new Set(scan.sources.map((source) => source.relativePath)));
    await mkdir(dirname(profile.cachePath), { recursive: true });
    await writeFile(profile.cachePath, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
    return profile;
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.message.includes("cancelled"))) throw error;
    const fallback = { ...base, generator: "deterministic-profile-v3-fallback" };
    await mkdir(dirname(fallback.cachePath), { recursive: true });
    await writeFile(fallback.cachePath, `${JSON.stringify(fallback, null, 2)}\n`, { mode: 0o600 });
    return fallback;
  }
}

export function idleProfileTask(): MemoryProfileGenerationTask {
  return { id: null, status: "idle", startedAt: null, finishedAt: null, error: null, profile: null };
}

const profileTasks = new BackgroundTaskManager<MemoryProfileGenerationTask, MemoryProfile>(idleProfileTask());

export function getProfileGeneration() {
  return profileTasks.get();
}

export function startProfileGeneration(rootOverride?: string | null) {
  const id = `profile-${Date.now()}`;
  return profileTasks.start(
    { id, status: "running", startedAt: isoNow(), finishedAt: null, error: null, profile: null },
    (signal) => generateMemoryProfile(rootOverride, signal),
    (task, profile) => ({ ...task, profile }),
  );
}

export function cancelProfileGeneration() {
  return profileTasks.cancel();
}
