import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentKind,
  MemoryEntry,
  MemoryProfile,
  MemoryProfileGenerationTask,
  MemoryProfileLocale,
} from "../../../../src/lib/types";
import { BackgroundTaskManager } from "../backgroundTask";
import { runCodexExec } from "../codex";
import { atomicWrite, isoNow } from "../shared";
import { loadMemoryCatalog } from "./catalog";
import { resolveAgentMemoryRoot } from "./paths";
import {
  currentMemoryEntries,
  memoryProfileCachePath,
  memoryProfileSourceHash,
} from "./profile";

function schemaPath() {
  const candidates = [
    join(process.cwd(), "schemas", "memory-profile.schema.json"),
    join(process.resourcesPath, "schemas", "memory-profile.schema.json"),
  ];
  const path = candidates.find(existsSync);
  if (!path) throw new Error("memory profile schema is unavailable");
  return path;
}

function normalizeProfile(
  profile: MemoryProfile,
  root: string,
  cachePath: string,
  sourceHash: string,
  inputEntries: number,
  currentEntries: number,
): MemoryProfile {
  return {
    ...profile,
    schemaVersion: "1",
    generatedAt: isoNow(),
    sourceHash,
    generator: "codex-profile-v4",
    cachePath,
    metadata: { memoryRoot: root, inputEntries, currentEntries },
  };
}

function validateProfile(profile: MemoryProfile, currentEntries: Map<string, MemoryEntry>) {
  if (!Array.isArray(profile.sections) || profile.sections.length > 8) {
    throw new Error("codex exec returned an invalid memory profile");
  }
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const section of profile.sections) {
    if (
      !section.id ||
      !section.title ||
      !section.body ||
      !section.evidence.length ||
      ids.has(section.id) ||
      titles.has(section.title)
    ) {
      throw new Error("codex exec returned an incomplete memory profile section");
    }
    ids.add(section.id);
    titles.add(section.title);
    const evidenceIds = new Set<string>();
    for (const evidence of section.evidence) {
      const entry = currentEntries.get(evidence.entryId);
      if (
        !entry ||
        evidenceIds.has(evidence.entryId) ||
        evidence.sourcePath !== entry.sourcePath ||
        evidence.startLine !== entry.startLine ||
        evidence.endLine !== entry.endLine
      ) {
        throw new Error("codex exec returned invalid memory profile evidence");
      }
      evidenceIds.add(evidence.entryId);
    }
  }
}

export async function generateMemoryProfile(
  agent: AgentKind,
  locale: MemoryProfileLocale,
  rootOverride?: string | null,
  signal?: AbortSignal,
) {
  const root = resolveAgentMemoryRoot(agent, rootOverride);
  const scan = await loadMemoryCatalog(agent, root);
  const current = currentMemoryEntries(scan.sources, scan.entries, scan.risks);
  if (!current.length) throw new Error("No current memory is available to generate a profile");

  const sourceHash = memoryProfileSourceHash(scan.sources, current);
  const cachePath = memoryProfileCachePath(root, locale);
  const sourceKinds = new Map(scan.sources.map((source) => [source.relativePath, source.kind]));
  const bundle = {
    schemaVersion: "1",
    agent,
    locale,
    memoryRoot: root,
    generatedAt: isoNow(),
    sourceHash,
    risks: scan.risks,
    entries: current.map((entry) => ({
      id: entry.id,
      topic: entry.topic,
      relatedTopics: entry.relatedTopics,
      title: entry.title,
      summary: entry.summary,
      sourcePath: entry.sourcePath,
      sourceKind: sourceKinds.get(entry.sourcePath),
      startLine: entry.startLine,
      endLine: entry.endLine,
      change: entry.change,
    })),
  };
  const languageInstruction =
    locale === "zh-CN" ? "Write in natural Simplified Chinese." : "Write in natural English.";
  const output = await runCodexExec({
    cwd: tmpdir(),
    schemaPath: schemaPath(),
    signal,
    stdin: JSON.stringify(bundle),
    prompt: `Analyze the Agent Backplane memory bundle from stdin and return only the Memory Profile JSON. ${languageInstruction} Build concise, independently reviewable observations around durable themes instead of restating entries. Treat adHocNote entries as explicit user corrections, avoid turning project-specific or one-off behavior into a global trait, and do not count derived summaries of the same event as independent confirmation. Use low confidence or uncertain stability when support is weak. Every evidence item must copy the exact entryId, sourcePath, startLine, and endLine from one input entry. Never invent or duplicate evidence.`,
  });
  const profile = normalizeProfile(
    JSON.parse(output) as MemoryProfile,
    root,
    cachePath,
    sourceHash,
    scan.entries.length,
    current.length,
  );
  validateProfile(profile, new Map(current.map((entry) => [entry.id, entry])));
  await atomicWrite(cachePath, `${JSON.stringify(profile, null, 2)}\n`);
  return profile;
}

export function idleProfileTask(): MemoryProfileGenerationTask {
  return {
    id: null,
    agent: null,
    locale: null,
    status: "idle",
    startedAt: null,
    finishedAt: null,
    error: null,
    profile: null,
  };
}

const profileTasks = new BackgroundTaskManager<MemoryProfileGenerationTask, MemoryProfile>(
  idleProfileTask(),
);

export function getProfileGeneration() {
  return profileTasks.get();
}

export function startProfileGeneration(agent: AgentKind, locale: MemoryProfileLocale) {
  const id = `profile-${agent}-${Date.now()}`;
  return profileTasks.start(
    {
      id,
      agent,
      locale,
      status: "running",
      startedAt: isoNow(),
      finishedAt: null,
      error: null,
      profile: null,
    },
    (signal) => generateMemoryProfile(agent, locale, null, signal),
    (task, profile) => ({ ...task, profile }),
  );
}

export function cancelProfileGeneration() {
  return profileTasks.cancel();
}
