import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MemoryEntry,
  MemoryProfile,
  MemoryProfileLocale,
  MemorySource,
  RiskFlag,
} from "../../../../src/lib/types";
import { resolveMemoryTruth } from "../../../../src/lib/memoryTruth";
import { sha256 } from "../shared";

const profileGenerator = "codex-profile-v4";

export function currentMemoryEntries(
  sources: MemorySource[],
  entries: MemoryEntry[],
  risks: RiskFlag[],
) {
  return resolveMemoryTruth({ root: "", sources, entries, risks }).current.map((item) => item.entry);
}

export function memoryProfileSourceHash(sources: MemorySource[], entries: MemoryEntry[]) {
  const currentPaths = new Set(entries.map((entry) => entry.sourcePath));
  return sha256(
    sources
      .filter((source) => currentPaths.has(source.relativePath))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      .map((source) => `${source.relativePath}\0${source.sha256}`)
      .join("\n"),
  );
}

export function memoryProfileCachePath(root: string, locale: MemoryProfileLocale) {
  return join(root, ".backplane", `profile.${locale}.json`);
}

function isCachedProfile(value: unknown): value is MemoryProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<MemoryProfile>;
  if (
    profile.schemaVersion !== "1" ||
    profile.generator !== profileGenerator ||
    typeof profile.generatedAt !== "string" ||
    typeof profile.sourceHash !== "string" ||
    !Array.isArray(profile.sections) ||
    !profile.metadata
  ) {
    return false;
  }
  const uniqueTitles = new Set(profile.sections.map((section) => section.title));
  const uniqueIds = new Set(profile.sections.map((section) => section.id));
  return (
    uniqueTitles.size === profile.sections.length &&
    uniqueIds.size === profile.sections.length &&
    profile.sections.every(
      (section) =>
        Boolean(section.id && section.title && section.body) &&
        Array.isArray(section.evidence) &&
        section.evidence.every((evidence) => Boolean(evidence.entryId)),
    )
  );
}

export async function loadMemoryProfileForRoot(
  root: string,
  locale: MemoryProfileLocale,
  sources: MemorySource[],
  entries: MemoryEntry[],
  risks: RiskFlag[],
) {
  const current = currentMemoryEntries(sources, entries, risks);
  const sourceHash = memoryProfileSourceHash(sources, current);
  const cachePath = memoryProfileCachePath(root, locale);
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as unknown;
    if (isCachedProfile(cached)) {
      return {
        profile: { ...cached, cachePath },
        profileStale: cached.sourceHash !== sourceHash,
        sourceHash,
      };
    }
  } catch {
    // A missing or invalid cache leaves the previous profile unavailable.
  }
  return { profile: null, profileStale: false, sourceHash };
}
