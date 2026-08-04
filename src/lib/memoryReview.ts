import {
  truthItemForEvidence,
  type MemoryTruthItem,
  type MemoryTruthModel,
  type MemoryTruthStatus,
} from "./memoryTruth";
import type { UiText } from "./i18n";
import type { EvidenceRef, MemoryProfileSection, MemorySource } from "./types";

export type ProfileSectionState = "steady" | "recent" | "review";

export function memoryTruthDisplayText(item: MemoryTruthItem, uiText: UiText) {
  const text = uiText.memorySummary.truthDecision;
  switch (item.decisionKind) {
    case "currentOverrides":
      return { decision: text.currentOverrides(item.decisionCount ?? 0) };
    case "currentCorrection":
      return { decision: text.currentCorrection };
    case "currentDefault":
      return { decision: text.currentDefault };
    case "reverted":
      return { decision: text.reverted, reviewReason: text.revertedReason };
    case "displaced":
      return { decision: text.displaced, reviewReason: text.displacedReason };
    case "conflict":
      return { decision: text.conflict, reviewReason: text.conflictReason };
    case "uncertainContext":
      return {
        decision: text.uncertainContext,
        reviewReason: text.uncertainContextReason,
      };
    default:
      return { decision: item.decision, reviewReason: item.reviewReason };
  }
}

export function memoryEvidenceTrustStatus(
  evidence: EvidenceRef,
  source: MemorySource | undefined,
  truth: MemoryTruthModel,
): MemoryTruthStatus {
  const truthItem = truthItemForEvidence(truth, evidence);
  if (truthItem) return truthItem.status;
  if (source?.kind === "chronicle") return "uncertain";
  if (source?.kind === "raw" || source?.kind === "rolloutSummary") return "stale";
  return source ? "current" : "uncertain";
}

export function memoryProfileSectionState(
  section: MemoryProfileSection,
  sources: MemorySource[],
  truth: MemoryTruthModel,
): ProfileSectionState {
  const evidenceStatuses = section.evidence.map((evidence) =>
    memoryEvidenceTrustStatus(
      evidence,
      sources.find((source) => source.relativePath === evidence.sourcePath),
      truth,
    ),
  );
  const hasExplicitCorrection = section.evidence.some(
    (evidence) =>
      sources.find((source) => source.relativePath === evidence.sourcePath)?.kind === "adHocNote",
  );
  if (
    section.confidence === "low" ||
    section.stability === "uncertain" ||
    (section.evidence.length === 1 && !hasExplicitCorrection) ||
    evidenceStatuses.some((status) => status !== "current")
  ) {
    return "review";
  }
  if (section.confidence === "medium" || section.stability === "recent") {
    return "recent";
  }
  return "steady";
}
