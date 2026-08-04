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

export const memoryProfileGenerator = "codex-profile-v7";
const profileExcerptBudget = 48_000;
const profileExcerptMaxChars = 1_200;

export function memoryProfileEntryExcerpts(entries: MemoryEntry[]) {
  const maxCharsPerEntry = Math.max(
    1,
    Math.min(profileExcerptMaxChars, Math.floor(profileExcerptBudget / Math.max(entries.length, 1))),
  );

  return new Map(entries.map((entry) => {
    const content = entry.searchText
      .replace(/<!--\s*agent-backplane-change\s+{[^\n]*}\s*-->/g, "")
      .trim();
    const characters = [...content];
    const excerpt = characters.length <= maxCharsPerEntry
      ? content
      : `${characters.slice(0, Math.max(0, maxCharsPerEntry - 1)).join("")}…`;
    return [entry.id, excerpt] as const;
  }));
}

export function currentMemoryEntries(
  sources: MemorySource[],
  entries: MemoryEntry[],
  risks: RiskFlag[],
) {
  return resolveMemoryTruth({ root: "", sources, entries, risks }).current.map((item) => item.entry);
}

export function canonicalizeMemoryProfileEvidence(
  profile: MemoryProfile,
  entriesByReference: Map<string, MemoryEntry>,
) {
  if (!Array.isArray(profile.sections) || profile.sections.length > 8) {
    throw new Error("codex exec returned an invalid memory profile");
  }
  const sectionIds = new Set<string>();
  const sectionTitles = new Set<string>();
  return {
    ...profile,
    sections: profile.sections.map((section) => {
      if (
        !section.id ||
        !section.title ||
        !section.body ||
        !section.evidence.length ||
        sectionIds.has(section.id) ||
        sectionTitles.has(section.title)
      ) {
        throw new Error("codex exec returned an incomplete memory profile section");
      }
      sectionIds.add(section.id);
      sectionTitles.add(section.title);
      const evidenceReferences = new Set<string>();
      return {
        ...section,
        evidence: section.evidence.map((evidence) => {
          const entry = entriesByReference.get(evidence.entryId);
          if (!entry || evidenceReferences.has(evidence.entryId)) {
            throw new Error(`codex exec returned an unknown or duplicate memory evidence reference: ${evidence.entryId}`);
          }
          evidenceReferences.add(evidence.entryId);
          return {
            entryId: entry.id,
            sourcePath: entry.sourcePath,
            startLine: entry.startLine,
            endLine: entry.endLine,
            summary: evidence.summary.trim() || entry.summary,
          };
        }),
      };
    }),
  } satisfies MemoryProfile;
}

export function memoryProfileSourceHash(sources: MemorySource[], entries: MemoryEntry[]) {
  const sourceHashes = new Map(sources.map((source) => [source.relativePath, source.sha256]));
  return sha256(
    [...entries]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) =>
        `${entry.id}\0${entry.revisionHash ?? sourceHashes.get(entry.sourcePath) ?? sha256(entry.searchText)}`,
      )
      .join("\n"),
  );
}

function refreshCachedEvidence(profile: MemoryProfile, entries: MemoryEntry[]) {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  return {
    ...profile,
    sections: profile.sections.map((section) => ({
      ...section,
      evidence: section.evidence.map((evidence) => {
        const entry = entriesById.get(evidence.entryId);
        return entry
          ? {
              ...evidence,
              sourcePath: entry.sourcePath,
              startLine: entry.startLine,
              endLine: entry.endLine,
              summary: entry.summary,
            }
          : evidence;
      }),
    })),
  };
}

export function memoryProfileCachePath(root: string, locale: MemoryProfileLocale) {
  return join(root, ".backplane", `profile.${locale}.json`);
}

function isCachedProfile(value: unknown): value is MemoryProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<MemoryProfile>;
  if (
    profile.schemaVersion !== "1" ||
    profile.generator !== memoryProfileGenerator ||
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
        profile: { ...refreshCachedEvidence(cached, current), cachePath },
        profileStale: cached.sourceHash !== sourceHash,
        sourceHash,
      };
    }
  } catch {
    // A missing or invalid cache leaves the previous profile unavailable.
  }
  return { profile: null, profileStale: false, sourceHash };
}
