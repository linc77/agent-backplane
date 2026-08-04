import { ExternalLink, FileText, PencilLine, RotateCcw } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getSourceExcerpt, openSourceFile } from "../lib/api";
import type { UiText } from "../lib/i18n";
import { memoryTruthDisplayText } from "../lib/memoryReview";
import type { MemoryTruthItem } from "../lib/memoryTruth";
import type { MemoryEntry, MemorySource, RiskFlag } from "../lib/types";

export function Inspector({
  entry,
  source,
  risk,
  truthItem,
  memoryRoot,
  uiText,
  writable,
  onDraftCorrection,
  onDraftRevert,
}: {
  entry?: MemoryEntry;
  source?: MemorySource;
  risk?: RiskFlag;
  truthItem?: MemoryTruthItem;
  memoryRoot?: string;
  uiText: UiText;
  writable: boolean;
  onDraftCorrection: (entry: MemoryEntry) => void;
  onDraftRevert: (entry: MemoryEntry) => void;
}) {
  const excerptQuery = useQuery({
    enabled: Boolean(entry && source && memoryRoot),
    queryKey: ["excerpt", memoryRoot, source?.path, entry?.startLine, entry?.endLine],
    queryFn: () =>
      getSourceExcerpt(memoryRoot ?? null, source!.path, entry!.startLine, entry!.endLine),
  });

  const openSourceMutation = useMutation({
    mutationFn: (path: string) => openSourceFile(path),
  });
  const excerptText = excerptQuery.error
    ? String(excerptQuery.error)
    : excerptQuery.data ?? uiText.inspector.loadingExcerpt;
  const displayText = truthItem ? memoryTruthDisplayText(truthItem, uiText) : undefined;

  if (!entry) {
    return (
      <aside className="inspector">
        <div className="empty-inspector">
          <FileText size={26} />
          <strong>{uiText.inspector.emptyTitle}</strong>
          <span>{uiText.inspector.emptyDescription}</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <p className="eyebrow">{uiText.inspector.eyebrow}</p>
      <h2>{entry.title}</h2>
      <p className="inspector-summary">{entry.summary}</p>

      {truthItem && (
        <section className={`inspector-panel truth ${truthItem.status}`}>
          <strong>{uiText.inspector.decisionPath}</strong>
          <span>
            {uiText.truthStatuses[truthItem.status]} · {Math.round(truthItem.confidence * 100)}%
          </span>
          <span>{displayText?.decision}</span>
        </section>
      )}

      {displayText?.reviewReason && (
        <section className="inspector-panel warning">
          <strong>{uiText.inspector.reviewReason}</strong>
          <span>{displayText.reviewReason}</span>
        </section>
      )}

      {truthItem && truthItem.staleCandidates.length > 0 && (
        <section className="inspector-panel">
          <strong>{uiText.inspector.staleCandidates}</strong>
          <ul className="inspector-list">
            {truthItem.staleCandidates.map((candidate) => (
              <li key={candidate.id}>
                {candidate.title} · {candidate.sourcePath}{" "}
                {uiText.format.lineRange(candidate.startLine, candidate.endLine)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {risk && (
        <section className="inspector-panel warning">
          <strong>{risk.title}</strong>
          <span>{risk.detail}</span>
        </section>
      )}

      <section className="inspector-panel">
        <strong>{uiText.inspector.source}</strong>
        <span>{source?.relativePath ?? entry.sourcePath}</span>
        <span>{uiText.format.lineRange(entry.startLine, entry.endLine)}</span>
      </section>

      <section className="inspector-panel">
        <strong>{uiText.inspector.excerpt}</strong>
        <pre>{excerptText}</pre>
      </section>

      <div className="inspector-actions">
        {writable && (
          <button className="primary-button" onClick={() => onDraftCorrection(entry)} type="button">
            <PencilLine size={16} />
            {uiText.inspector.draftCorrection}
          </button>
        )}
        {writable && entry.change?.operation === "replace" && truthItem?.status === "current" && (
          <button className="secondary-button" onClick={() => onDraftRevert(entry)} type="button">
            <RotateCcw size={16} />
            {uiText.inspector.revertChange}
          </button>
        )}
        <button
          className="secondary-button"
          disabled={!source || openSourceMutation.isPending}
          onClick={() => source && openSourceMutation.mutate(source.path)}
          type="button"
        >
          <ExternalLink size={16} />
          {uiText.inspector.openSource}
        </button>
      </div>
      {openSourceMutation.error && (
        <div className="inspector-error">{String(openSourceMutation.error)}</div>
      )}
    </aside>
  );
}
