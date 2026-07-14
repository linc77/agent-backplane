import { ExternalLink, FileText, PencilLine } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getSourceExcerpt, openSourceFile } from "../lib/api";
import type { UiText } from "../lib/i18n";
import type { MemoryTruthItem } from "../lib/memoryTruth";
import type { MemoryEntry, MemorySource, RiskFlag } from "../lib/types";

export function Inspector({
  entry,
  source,
  risk,
  truthItem,
  uiText,
  onDraftCorrection,
}: {
  entry?: MemoryEntry;
  source?: MemorySource;
  risk?: RiskFlag;
  truthItem?: MemoryTruthItem;
  uiText: UiText;
  onDraftCorrection: (entry: MemoryEntry) => void;
}) {
  const excerptQuery = useQuery({
    enabled: Boolean(entry && source),
    queryKey: ["excerpt", source?.path, entry?.startLine, entry?.endLine],
    queryFn: () => getSourceExcerpt(null, source!.path, entry!.startLine, entry!.endLine),
  });

  const openSourceMutation = useMutation({
    mutationFn: (path: string) => openSourceFile(path),
  });
  const excerptText = excerptQuery.error
    ? String(excerptQuery.error)
    : excerptQuery.data ?? uiText.inspector.loadingExcerpt;

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
          <span>{truthItem.decision}</span>
        </section>
      )}

      {truthItem?.reviewReason && (
        <section className="inspector-panel warning">
          <strong>{uiText.inspector.reviewReason}</strong>
          <span>{truthItem.reviewReason}</span>
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
        <button className="primary-button" onClick={() => onDraftCorrection(entry)} type="button">
          <PencilLine size={16} />
          {uiText.inspector.draftCorrection}
        </button>
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
