import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentKind,
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
  canonicalizeMemoryProfileEvidence,
  currentMemoryEntries,
  memoryProfileEntryExcerpts,
  memoryProfileCachePath,
  memoryProfileGenerator,
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
    generator: memoryProfileGenerator,
    cachePath,
    metadata: { memoryRoot: root, inputEntries, currentEntries },
  };
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
  const entryExcerpts = memoryProfileEntryExcerpts(current);
  const referenceWidth = Math.max(3, String(current.length).length);
  const referencedEntries = current.map((entry, index) => ({
    reference: `C${String(index + 1).padStart(referenceWidth, "0")}`,
    entry,
  }));
  const entriesByReference = new Map(
    referencedEntries.map(({ reference, entry }) => [reference, entry]),
  );
  const bundle = {
    schemaVersion: "1",
    agent,
    locale,
    memoryRoot: root,
    generatedAt: isoNow(),
    sourceHash,
    risks: scan.risks,
    entries: referencedEntries.map(({ reference, entry }) => ({
      id: reference,
      topic: entry.topic,
      relatedTopics: entry.relatedTopics,
      title: entry.title,
      summary: entry.summary,
      contentExcerpt: entryExcerpts.get(entry.id),
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
    ignoreUserConfig: true,
    model: process.env.BACKPLANE_PROFILE_MODEL?.trim() || "gpt-5.6-sol",
    reasoningEffort: "medium",
    prompt: `Analyze the Agent Backplane memory bundle from stdin and return only the Memory Profile JSON. ${languageInstruction} Build concise, independently reviewable observations around durable themes instead of restating entries. Inspect contentExcerpt for facts beyond the first summary line, but keep each claim independently reviewable. Treat adHocNote entries as explicit user corrections, avoid turning project-specific or one-off behavior into a global trait, and do not count derived summaries of the same event as independent confirmation. Use low confidence or uncertain stability when support is weak. Every evidence item must use the exact short input id such as C001 as entryId. Write every evidence.summary as a concise natural-language explanation in the requested profile language; do not copy machine metadata or instruction fragments. Source paths and line ranges are canonicalized by the backend, so do not infer an id and never duplicate evidence within a section.`,
  });
  const profile = normalizeProfile(
    JSON.parse(output) as MemoryProfile,
    root,
    cachePath,
    sourceHash,
    scan.entries.length,
    current.length,
  );
  const canonicalProfile = canonicalizeMemoryProfileEvidence(profile, entriesByReference);
  await atomicWrite(cachePath, `${JSON.stringify(canonicalProfile, null, 2)}\n`);
  return canonicalProfile;
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
