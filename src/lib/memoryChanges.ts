import type { MemoryEntry } from "./types";

export interface MemoryTargetResolution {
  requestedId: string;
  entries: MemoryEntry[];
  mode: "id" | "revision" | "unresolved";
}

export function memoryEntryIds(entry: MemoryEntry) {
  return [entry.id, ...(entry.aliasIds ?? [])];
}

export function buildMemoryAliasIndex(entries: MemoryEntry[]) {
  const index = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    for (const id of new Set(memoryEntryIds(entry))) {
      const matches = index.get(id) ?? [];
      matches.push(entry);
      index.set(id, matches);
    }
  }
  return index;
}

export function resolveMemoryTargets(
  entries: MemoryEntry[],
  requestedIds: string[],
  targetRevisions: Record<string, string> = {},
) {
  const aliasIndex = buildMemoryAliasIndex(entries);
  return [...new Set(requestedIds)].map((requestedId): MemoryTargetResolution => {
    const direct = aliasIndex.get(requestedId) ?? [];
    if (direct.length) return { requestedId, entries: direct, mode: "id" };

    const expectedRevision = targetRevisions[requestedId];
    const revisionMatches = expectedRevision
      ? entries.filter((entry) => entry.revisionHash === expectedRevision)
      : [];
    if (revisionMatches.length === 1) {
      return { requestedId, entries: revisionMatches, mode: "revision" };
    }
    return { requestedId, entries: [], mode: "unresolved" };
  });
}

export function resolvedMemoryTargetIds(
  entries: MemoryEntry[],
  requestedIds: string[],
  targetRevisions: Record<string, string> = {},
) {
  return [...new Set(
    resolveMemoryTargets(entries, requestedIds, targetRevisions)
      .flatMap((resolution) => resolution.entries.map((entry) => entry.id)),
  )];
}
