import type {
  EvidenceRef,
  MemoryEntry,
  MemorySource,
  MemorySourceKind,
  MemoryTopic,
  RiskFlag,
  ScanResult,
} from "./types";

export type MemoryTruthStatus = "current" | "stale" | "uncertain" | "conflict";

export interface MemoryTruthItem {
  id: string;
  status: MemoryTruthStatus;
  entry: MemoryEntry;
  source?: MemorySource;
  confidence: number;
  priorityRank: number;
  decision: string;
  reviewReason?: string;
  risk?: RiskFlag;
  staleCandidates: MemoryEntry[];
}

export interface MemoryTruthModel {
  current: MemoryTruthItem[];
  review: MemoryTruthItem[];
  byEntryId: Map<string, MemoryTruthItem>;
}

export const truthSourcePriority: MemorySourceKind[] = [
  "adHocNote",
  "registry",
  "summary",
  "skill",
  "rolloutSummary",
  "raw",
  "chronicle",
];

const currentTopics = new Set<MemoryTopic>([
  "profile",
  "projects",
  "rules",
  "tools",
  "writing",
  "overrides",
]);

const durableSourceKinds = new Set<MemorySourceKind>(["summary", "registry", "adHocNote", "skill"]);

const statusWeight: Record<MemoryTruthStatus, number> = {
  conflict: 0,
  stale: 1,
  uncertain: 2,
  current: 3,
};

export function resolveMemoryTruth(scan?: ScanResult): MemoryTruthModel {
  const sources = scan?.sources ?? [];
  const entries = scan?.entries ?? [];
  const riskByEntryId = new Map((scan?.risks ?? []).map((risk) => [risk.entryId, risk]));
  const durableEntries = entries.filter((entry) => isDurableCurrentCandidate(entry, sources));
  const revertedChangeIds = new Set(
    durableEntries
      .filter((entry) => entry.change?.operation === "revert")
      .map((entry) => entry.change?.revertsChangeId)
      .filter((id): id is string => Boolean(id)),
  );
  const correctionEntries = durableEntries
    .filter((entry) => hasCorrectionAuthority(entry, sources) && !revertedChangeIds.has(entry.change!.id))
    .sort((left, right) => left.change!.createdAt.localeCompare(right.change!.createdAt));
  const staleByEntryId = new Map<string, MemoryEntry>();
  const staleForCorrection = new Map<string, MemoryEntry[]>();

  for (const correction of correctionEntries) {
    const targetIds = new Set(correction.change?.targetEntryIds ?? []);
    const candidates = durableEntries.filter((entry) => targetIds.has(entry.id));

    if (candidates.length) {
      staleForCorrection.set(correction.id, sortEntries(candidates, sources));
      for (const candidate of candidates) {
        staleByEntryId.set(candidate.id, correction);
      }
    }
  }

  const current = sortEntries(durableEntries, sources)
    .filter((entry) =>
      entry.change?.operation !== "revert" &&
      !revertedChangeIds.has(entry.change?.id ?? "") &&
      !staleByEntryId.has(entry.id) &&
      !riskByEntryId.has(entry.id))
    .map((entry) =>
      buildTruthItem({
        entry,
        sources,
        status: "current",
        decision: currentDecision(entry, staleForCorrection.get(entry.id)?.length ?? 0),
        staleCandidates: staleForCorrection.get(entry.id) ?? [],
      }),
    );

  const review = [
    ...sortEntries(durableEntries, sources)
      .filter((entry) => entry.change?.operation === "replace" && revertedChangeIds.has(entry.change.id))
      .map((entry) => buildTruthItem({
        entry,
        sources,
        status: "stale",
        decision: "This memory change was reverted.",
        reviewReason: "The targeted claim was restored by a later revert.",
        staleCandidates: [],
      })),
    ...sortEntries(durableEntries, sources)
      .filter((entry) => staleByEntryId.has(entry.id))
      .map((entry) => {
        const winner = staleByEntryId.get(entry.id)!;
        return buildTruthItem({
          entry,
          sources,
          status: "stale",
          decision: `Displaced by higher-priority memory: ${winner.title}.`,
          reviewReason: "A newer or higher-priority correction now owns this memory lane.",
          staleCandidates: [],
        });
      }),
    ...sortEntries(durableEntries, sources)
      .filter((entry) => riskByEntryId.has(entry.id) && !staleByEntryId.has(entry.id))
      .map((entry) => {
        const risk = riskByEntryId.get(entry.id)!;
        return buildTruthItem({
          entry,
          sources,
          status: "conflict",
          decision: risk.title,
          reviewReason: risk.detail,
          risk,
          staleCandidates: [],
        });
      }),
    ...sortEntries(entries, sources)
      .filter((entry) => isUncertainEntry(entry, sources))
      .map((entry) =>
        buildTruthItem({
          entry,
          sources,
          status: "uncertain",
          decision: "Activity evidence is useful context, but not durable memory truth.",
          reviewReason: "Promote this into a correction note only if it should become durable.",
          staleCandidates: [],
        }),
      ),
  ].sort((left, right) => compareTruthItems(left, right));

  const byEntryId = new Map<string, MemoryTruthItem>();
  for (const item of [...current, ...review]) {
    byEntryId.set(item.entry.id, item);
  }

  return { current, review, byEntryId };
}

export function sourceForEntry(sources: MemorySource[], entry: MemoryEntry) {
  return sources.find((source) => source.relativePath === entry.sourcePath);
}

export function truthItemForEvidence(
  truth: MemoryTruthModel,
  evidence: EvidenceRef,
): MemoryTruthItem | undefined {
  const directMatch = truth.byEntryId.get(evidence.entryId);
  if (directMatch) return directMatch;

  const candidates = Array.from(truth.byEntryId.values()).filter(
    (item) =>
      item.entry.sourcePath === evidence.sourcePath &&
      rangesOverlap(
        item.entry.startLine,
        item.entry.endLine,
        evidence.startLine,
        evidence.endLine,
      ),
  );

  return (
    candidates.find(
      (item) =>
        item.entry.startLine === evidence.startLine &&
        item.entry.endLine === evidence.endLine,
    ) ?? candidates.sort(compareTruthItems)[0]
  );
}

function isDurableCurrentCandidate(entry: MemoryEntry, sources: MemorySource[]) {
  const source = sourceForEntry(sources, entry);
  const hasCurrentTopic =
    currentTopics.has(entry.topic) ||
    entry.relatedTopics.some((topic) => currentTopics.has(topic));

  return hasCurrentTopic && (!source || durableSourceKinds.has(source.kind));
}

function isUncertainEntry(entry: MemoryEntry, sources: MemorySource[]) {
  const source = sourceForEntry(sources, entry);
  return entry.topic === "activityLog" || source?.kind === "chronicle";
}

function hasCorrectionAuthority(entry: MemoryEntry, sources: MemorySource[]) {
  return (
    (entry.topic === "overrides" || sourceForEntry(sources, entry)?.kind === "adHocNote") &&
    entry.change?.operation === "replace" &&
    entry.change.targetEntryIds.length > 0
  );
}

function sourceRank(entry: MemoryEntry, sources: MemorySource[]) {
  const source = sourceForEntry(sources, entry);
  const index = source ? truthSourcePriority.indexOf(source.kind) : -1;
  return index >= 0 ? index : truthSourcePriority.length;
}

function sortEntries(entries: MemoryEntry[], sources: MemorySource[]) {
  return [...entries].sort((left, right) => {
    const rankDiff = sourceRank(left, sources) - sourceRank(right, sources);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return left.startLine - right.startLine || left.id.localeCompare(right.id);
  });
}

function buildTruthItem({
  entry,
  sources,
  status,
  decision,
  reviewReason,
  risk,
  staleCandidates,
}: {
  entry: MemoryEntry;
  sources: MemorySource[];
  status: MemoryTruthStatus;
  decision: string;
  reviewReason?: string;
  risk?: RiskFlag;
  staleCandidates: MemoryEntry[];
}): MemoryTruthItem {
  const priorityRank = sourceRank(entry, sources);

  return {
    id: `${status}:${entry.id}`,
    status,
    entry,
    source: sourceForEntry(sources, entry),
    confidence: confidenceForStatus(status, priorityRank, staleCandidates.length),
    priorityRank,
    decision,
    reviewReason,
    risk,
    staleCandidates,
  };
}

function currentDecision(entry: MemoryEntry, staleCandidateCount: number) {
  if (staleCandidateCount > 0) {
    return `Current because a higher-priority correction overrides ${staleCandidateCount} lower-priority memory slice${staleCandidateCount === 1 ? "" : "s"}.`;
  }

  if (entry.topic === "overrides") {
    return "Current because correction notes have highest priority.";
  }

  return "Current because no higher-priority correction or risk displaces this memory.";
}

function confidenceForStatus(status: MemoryTruthStatus, priorityRank: number, staleCandidateCount: number) {
  if (status === "current") {
    return Math.max(0.62, Math.min(0.96, 0.9 - priorityRank * 0.05 + staleCandidateCount * 0.02));
  }
  if (status === "stale") {
    return 0.78;
  }
  if (status === "conflict") {
    return 0.72;
  }
  return 0.52;
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function compareTruthItems(left: MemoryTruthItem, right: MemoryTruthItem) {
  const statusDiff = statusWeight[left.status] - statusWeight[right.status];
  if (statusDiff !== 0) {
    return statusDiff;
  }

  return left.priorityRank - right.priorityRank || left.entry.title.localeCompare(right.entry.title);
}
