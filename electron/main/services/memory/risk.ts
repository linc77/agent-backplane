import type { MemoryEntry, RiskFlag } from "../../../../src/lib/types";

export function detectRisks(entries: MemoryEntry[]) {
  const text = entries.map((entry) => `${entry.title} ${entry.summary}`).join("\n").toLowerCase();
  const risks: RiskFlag[] = [];
  if (text.includes("java") && text.includes("spring boot") && text.includes("python/rust")) {
    const entry = entries.find((candidate) => {
      const value = `${candidate.title} ${candidate.summary}`.toLowerCase();
      return value.includes("java") || value.includes("spring boot");
    });
    if (entry) {
      risks.push({
        id: "profile-stack-conflict",
        kind: "staleConflict",
        title: "Profile stack conflict",
        detail: "Old Java/Spring Boot profile conflicts with newer Python/Rust override.",
        entryId: entry.id,
      });
    }
  }
  if (text.includes("dilidili") && text.includes("no longer an active project")) {
    const entry = entries.find((candidate) =>
      `${candidate.title} ${candidate.summary}`.toLowerCase().includes("dilidili"),
    );
    if (entry) {
      risks.push({
        id: "dilidili-active-project-conflict",
        kind: "coveredByOverride",
        title: "Project activity override",
        detail: "`dilidili` appears in older project memory but is covered by a newer inactive-project override.",
        entryId: entry.id,
      });
    }
  }
  return risks;
}
