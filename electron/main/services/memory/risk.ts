import type { MemoryEntry, RiskFlag } from "../../../../src/lib/types";
import { resolveMemoryTargets, resolvedMemoryTargetIds } from "../../../../src/lib/memoryChanges";

export function detectRisks(entries: MemoryEntry[]) {
  const risks: RiskFlag[] = [];
  const changes = entries.filter((entry) => entry.change);
  const changeIds = new Set(changes.map((entry) => entry.change!.id));
  const revertedChangeIds = new Set(
    changes
      .filter((entry) => entry.change!.operation === "revert")
      .map((entry) => entry.change!.revertsChangeId)
      .filter((id): id is string => Boolean(id)),
  );

  for (const entry of changes) {
    const change = entry.change!;
    if (change.operation === "replace") {
      const missingTargets = resolveMemoryTargets(
        entries,
        change.targetEntryIds,
        change.targetRevisions,
      ).filter((resolution) => resolution.mode === "unresolved");
      if (missingTargets.length) {
        risks.push({
          id: `missing-target:${change.id}`,
          kind: "staleConflict",
          title: "Correction target is unavailable",
          detail: `This change targets ${missingTargets.length} memory claim(s) that no longer exist.`,
          entryId: entry.id,
        });
      }
    }
    if (change.operation === "revert" && change.revertsChangeId && !changeIds.has(change.revertsChangeId)) {
      risks.push({
        id: `missing-revert:${change.id}`,
        kind: "staleConflict",
        title: "Reverted change is unavailable",
        detail: "This revert references a memory change that no longer exists.",
        entryId: entry.id,
      });
    }
  }

  const replacementsByTarget = new Map<string, MemoryEntry[]>();
  for (const entry of changes) {
    const change = entry.change!;
    if (change.operation !== "replace" || revertedChangeIds.has(change.id)) continue;
    for (const targetId of resolvedMemoryTargetIds(
      entries,
      change.targetEntryIds,
      change.targetRevisions,
    )) {
      const replacements = replacementsByTarget.get(targetId) ?? [];
      replacements.push(entry);
      replacementsByTarget.set(targetId, replacements);
    }
  }
  for (const [targetId, replacements] of replacementsByTarget) {
    if (replacements.length < 2) continue;
    const sorted = [...replacements].sort((left, right) =>
      left.change!.createdAt.localeCompare(right.change!.createdAt));
    for (const covered of sorted.slice(0, -1)) {
      risks.push({
        id: `covered-change:${targetId}:${covered.change!.id}`,
        kind: "coveredByOverride",
        title: "Correction covered by a newer change",
        detail: "A newer targeted correction now owns this memory claim.",
        entryId: covered.id,
      });
    }
  }
  return risks;
}
