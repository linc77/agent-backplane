import { resolveMemoryTruth, truthSourcePriority } from "./memoryTruth";
import type { MemoryEntry, MemorySource, MemorySourceKind, ScanResult } from "./types";

export type MemoryView =
  | "overview"
  | "effective"
  | "summary"
  | "registry"
  | "corrections"
  | "sessions"
  | "activity"
  | "raw"
  | "skills"
  | "skillManager"
  | "allSources"
  | "audit";

export const sourcePriority: MemorySourceKind[] = truthSourcePriority;

const sourceViewKinds: Partial<Record<MemoryView, MemorySourceKind[]>> = {
  summary: ["summary"],
  registry: ["registry"],
  corrections: ["adHocNote"],
  sessions: ["rolloutSummary"],
  activity: ["chronicle"],
  raw: ["raw"],
  skills: ["skill"],
  allSources: sourcePriority,
};

export function findSourceForEntry(sources: MemorySource[], entry: MemoryEntry) {
  return sources.find((source) => source.relativePath === entry.sourcePath);
}

export function sourceKindsForView(view: MemoryView) {
  return sourceViewKinds[view] ?? [];
}

export function isSourceView(view: MemoryView) {
  return Boolean(sourceViewKinds[view]);
}

export function sourceCountByKind(sources: MemorySource[]) {
  const counts = new Map<MemorySourceKind, number>();
  for (const kind of sourcePriority) {
    counts.set(kind, 0);
  }
  for (const source of sources) {
    counts.set(source.kind, (counts.get(source.kind) ?? 0) + 1);
  }
  return counts;
}

export function memoryViewCount(view: MemoryView, scan?: ScanResult) {
  const sources = scan?.sources ?? [];
  const truth = resolveMemoryTruth(scan);

  if (view === "overview") {
    return undefined;
  }
  if (view === "effective") {
    return truth.current.length;
  }
  if (view === "audit") {
    return undefined;
  }
  if (isSourceView(view)) {
    const kinds = sourceKindsForView(view);
    return sources.filter((source) => kinds.includes(source.kind)).length;
  }

  return 0;
}

export function entriesForView(view: MemoryView, scan?: ScanResult) {
  const sources = scan?.sources ?? [];
  const entries = scan?.entries ?? [];
  const truth = resolveMemoryTruth(scan);

  if (view === "effective") {
    return truth.current.map((item) => item.entry);
  }
  if (view === "corrections") {
    return entries.filter((entry) => findSourceForEntry(sources, entry)?.kind === "adHocNote");
  }

  return [];
}

export function sourcesForView(view: MemoryView, scan?: ScanResult) {
  const sources = scan?.sources ?? [];
  const kinds = sourceKindsForView(view);
  if (!kinds.length) {
    return [];
  }
  return sources.filter((source) => kinds.includes(source.kind));
}
