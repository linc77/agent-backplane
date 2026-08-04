import {
  ExternalLink,
  FileText,
  History,
  LayoutGrid,
  Lightbulb,
  List,
  Network,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { agentMeta } from "../lib/agentScope";
import type { Locale, UiText } from "../lib/i18n";
import {
  resolveMemoryTruth,
  type MemoryTruthItem,
  type MemoryTruthModel,
} from "../lib/memoryTruth";
import {
  memoryEvidenceTrustStatus,
  memoryProfileSectionState,
  memoryTruthDisplayText,
} from "../lib/memoryReview";
import type {
  AgentKind,
  MemoryEntry,
  MemoryProfile,
  MemoryProfileSection,
  MemorySource,
  ScanResult,
} from "../lib/types";
import { MemoryGraph } from "./MemoryGraph";

type BoardView = "graph" | "profile" | "review" | "memories";

function ProfileEvidenceDetails({
  onOpenSource,
  section,
  sources,
  truth,
  uiText,
}: {
  onOpenSource: (path: string) => void;
  section: MemoryProfileSection;
  sources: MemorySource[];
  truth: MemoryTruthModel;
  uiText: UiText;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details className="memory-evidence" onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary>{uiText.memorySummary.viewEvidence(section.evidence.length)}</summary>
      {isOpen && (
        <div className="profile-evidence-list">
          <div className="profile-certainty">
            <span>{uiText.memorySummary.stability[section.stability]}</span>
            <span>{uiText.memorySummary.confidence[section.confidence]}</span>
          </div>
          {section.evidence.map((evidence) => {
            const source = sources.find((item) => item.relativePath === evidence.sourcePath);
            const status = memoryEvidenceTrustStatus(evidence, source, truth);
            return (
              <article className={`profile-evidence-row ${status}`} key={evidence.entryId}>
                <p>{evidence.summary}</p>
                <div className="profile-evidence-main">
                  {source ? (
                    <button
                      className="evidence-link"
                      onClick={() => onOpenSource(source.path)}
                      type="button"
                    >
                      {uiText.format.evidence(
                        evidence.sourcePath,
                        evidence.startLine,
                        evidence.endLine,
                      )}
                      <ExternalLink aria-hidden="true" size={12} />
                    </button>
                  ) : (
                    <span>
                      {uiText.format.evidence(
                        evidence.sourcePath,
                        evidence.startLine,
                        evidence.endLine,
                      )}
                    </span>
                  )}
                  <span className={`evidence-status ${status}`}>
                    {uiText.memorySummary.evidenceTrust[status]}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </details>
  );
}

function formatGeneratedAt(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function matchesMemory(entry: MemoryEntry, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return `${entry.title}\n${entry.summary}\n${entry.sourcePath}`.toLocaleLowerCase().includes(normalized);
}

function TruthReviewCard({
  item,
  onDraftCorrection,
  onOpenSource,
  uiText,
  writable,
}: {
  item: MemoryTruthItem;
  onDraftCorrection: (entry: MemoryEntry) => void;
  onOpenSource: (path: string) => void;
  uiText: UiText;
  writable: boolean;
}) {
  const canCorrect = item.status === "conflict" || item.status === "uncertain";
  const displayText = memoryTruthDisplayText(item, uiText);

  return (
    <article className={`memory-review-card ${item.status}`}>
      <header>
        <span className={`evidence-status ${item.status}`}>
          {uiText.truthStatuses[item.status]}
        </span>
        <span>{uiText.memoryCards[item.entry.topic]}</span>
      </header>
      <h3>{item.entry.title}</h3>
      <p>{item.entry.summary}</p>
      <div className="memory-review-decision">
        <strong>{uiText.inspector.decisionPath}</strong>
        <p>{displayText.decision}</p>
        {displayText.reviewReason && (
          <>
            <strong>{uiText.inspector.reviewReason}</strong>
            <p>{displayText.reviewReason}</p>
          </>
        )}
        <span>
          {uiText.truthStatuses[item.status]} · {Math.round(item.confidence * 100)}%
        </span>
      </div>
      {item.staleCandidates.length > 0 && (
        <div className="memory-review-candidates">
          <strong>{uiText.inspector.staleCandidates}</strong>
          <ul>
            {item.staleCandidates.map((candidate) => (
              <li key={candidate.id}>{candidate.title}</li>
            ))}
          </ul>
        </div>
      )}
      <footer>
        {item.source && (
          <button
            className="memory-source-link"
            onClick={() => onOpenSource(item.source!.path)}
            type="button"
          >
            <FileText aria-hidden="true" size={13} />
            {uiText.format.evidence(
              item.entry.sourcePath,
              item.entry.startLine,
              item.entry.endLine,
            )}
          </button>
        )}
        {writable && canCorrect && (
          <button
            className="memory-record-edit"
            onClick={() => onDraftCorrection(item.entry)}
            type="button"
          >
            {item.status === "uncertain" ? (
              <Lightbulb aria-hidden="true" size={13} />
            ) : (
              <PencilLine aria-hidden="true" size={13} />
            )}
            {item.status === "uncertain"
              ? uiText.memorySummary.promoteMemory
              : uiText.memorySummary.editMemory}
          </button>
        )}
      </footer>
    </article>
  );
}

export function KnowledgeBoard({
  isProfileLoading,
  isProfileRegenerating,
  locale,
  onCancelProfileGeneration,
  onDraftEntryCorrection,
  onDraftNewMemory,
  onDraftProfileCorrection,
  onDraftRevert,
  onOpenSource,
  onRegenerateProfile,
  profile,
  profileError,
  profileStale,
  scan,
  selectedAgent,
  uiText,
  writable,
}: {
  isProfileLoading: boolean;
  isProfileRegenerating: boolean;
  locale: Locale;
  profile: MemoryProfile | null | undefined;
  profileError?: unknown;
  profileStale: boolean;
  scan?: ScanResult;
  selectedAgent: AgentKind;
  uiText: UiText;
  writable: boolean;
  onCancelProfileGeneration: () => void;
  onRegenerateProfile: () => void;
  onDraftProfileCorrection: (section: MemoryProfileSection) => void;
  onDraftEntryCorrection: (entry: MemoryEntry) => void;
  onDraftNewMemory: () => void;
  onDraftRevert: (entry: MemoryEntry) => void;
  onOpenSource: (path: string) => void;
}) {
  const [view, setView] = useState<BoardView>("graph");
  const [memoryQuery, setMemoryQuery] = useState("");
  const sources = scan?.sources ?? [];
  const truth = useMemo(() => resolveMemoryTruth(scan), [scan]);
  const currentMemories = truth.current.map((item) => item.entry);
  const reviewSections = (profile?.sections ?? []).filter(
    (section) => memoryProfileSectionState(section, sources, truth) === "review",
  );
  const conflictReviewItems = truth.review.filter((item) => item.status === "conflict");
  const historicalReviewItems = truth.review.filter((item) => item.status === "stale");
  const uncertainReviewItems = truth.review.filter((item) => item.status === "uncertain");
  const attentionCount = reviewSections.length + conflictReviewItems.length;
  const hasReviewContent = Boolean(
    attentionCount || historicalReviewItems.length || uncertainReviewItems.length,
  );
  const visibleSections = profile?.sections ?? [];
  const visibleMemories = currentMemories.filter((entry) => matchesMemory(entry, memoryQuery));
  const hasMemory = Boolean(scan?.entries.length);
  const statusMessage = profileError
    ? profile
      ? uiText.memorySummary.failedWithPrevious
      : uiText.memorySummary.failedWithoutProfile
    : isProfileRegenerating
      ? profile
        ? uiText.memorySummary.updatingWithPrevious
        : uiText.memorySummary.generatingFirst
      : profileStale && profile
        ? uiText.memorySummary.stale
        : null;

  function showReviewCenter() {
    setView("review");
  }

  function renderProfilePlaceholder() {
    if (isProfileLoading && !profile) {
      return (
        <div className="memory-profile-placeholder" aria-live="polite">
          <strong>{uiText.memorySummary.loading}</strong>
        </div>
      );
    }
    if (!isProfileLoading && !profile && !hasMemory) {
      return (
        <div className="memory-profile-placeholder">
          <strong>{uiText.memorySummary.emptyTitle}</strong>
          <p>{uiText.memorySummary.emptyDescription}</p>
        </div>
      );
    }
    if (!isProfileLoading && !profile && hasMemory && !isProfileRegenerating && !profileError) {
      return (
        <div className="memory-profile-placeholder">
          <strong>{uiText.memorySummary.readyTitle}</strong>
          <p>{uiText.memorySummary.readyDescription}</p>
        </div>
      );
    }
    return null;
  }

  const overviewPanel = (
    <div className="memory-overview-panel">
      <span className="memory-overview-eyebrow">{uiText.memorySummary.eyebrow}</span>
      <h1>{uiText.memorySummary.title(agentMeta[selectedAgent].label)}</h1>
      <p className="memory-overview-description">
        {uiText.memorySummary.description(agentMeta[selectedAgent].label)}
      </p>
      {(profile || currentMemories.length > 0) && (
        <div className="memory-overview-sidebar-stats" aria-label={uiText.memorySummary.overviewLabel}>
          <div>
            <strong>{profile?.sections.length ?? 0}</strong>
            <span>{uiText.memorySummary.profileThemes}</span>
          </div>
          <button onClick={() => setView("memories")} type="button">
            <strong>{currentMemories.length}</strong>
            <span>{uiText.memorySummary.currentMemories}</span>
          </button>
          <button
            className={attentionCount ? "attention" : ""}
            disabled={!hasReviewContent}
            onClick={showReviewCenter}
            type="button"
          >
            <strong>{attentionCount}</strong>
            <span>{uiText.memorySummary.needsAttention}</span>
          </button>
        </div>
      )}
      {profile && (
        <p className="memory-overview-updated">
          {uiText.memorySummary.generatedAt(
            formatGeneratedAt(profile.generatedAt, locale),
            profile.metadata.currentEntries,
          )}
        </p>
      )}
      <button
        className="secondary-button memory-overview-update"
        disabled={isProfileLoading || (!hasMemory && !profile)}
        onClick={isProfileRegenerating ? onCancelProfileGeneration : onRegenerateProfile}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={15} />
        {isProfileRegenerating
          ? uiText.memorySummary.cancelGeneration
          : uiText.memorySummary.updateProfile}
      </button>
      {statusMessage && (
        <div
          aria-live="polite"
          className={`memory-profile-status memory-overview-status ${profileError ? "error" : ""}`}
        >
          <strong>{statusMessage}</strong>
          {Boolean(profileError) && (
            <details>
              <summary>{uiText.memorySummary.errorDetails}</summary>
              <span>{String(profileError)}</span>
            </details>
          )}
        </div>
      )}
    </div>
  );

  return (
    <main className="board memory-board">
      <section className="memory-profile">

        {(profile || currentMemories.length > 0) && (
          <div className="memory-view-toolbar">
            <div aria-label={uiText.memorySummary.viewLabel} className="memory-view-switch" role="group">
              <button
                aria-pressed={view === "graph"}
                className={view === "graph" ? "active" : ""}
                onClick={() => setView("graph")}
                type="button"
              >
                <Network aria-hidden="true" size={15} />
                {uiText.memorySummary.graphView}
              </button>
              <button
                aria-pressed={view === "profile"}
                className={view === "profile" ? "active" : ""}
                onClick={() => setView("profile")}
                type="button"
              >
                <LayoutGrid aria-hidden="true" size={15} />
                {uiText.memorySummary.profileView}
              </button>
              <button
                aria-pressed={view === "review"}
                className={view === "review" ? "active" : ""}
                onClick={() => setView("review")}
                type="button"
              >
                <ShieldAlert aria-hidden="true" size={15} />
                {uiText.memorySummary.reviewView}
                {attentionCount > 0 && (
                  <span className="memory-view-count">{attentionCount}</span>
                )}
              </button>
              <button
                aria-pressed={view === "memories"}
                className={view === "memories" ? "active" : ""}
                onClick={() => setView("memories")}
                type="button"
              >
                <List aria-hidden="true" size={15} />
                {uiText.memorySummary.memoryView}
              </button>
            </div>
          </div>
        )}

        {view === "graph" && (
          <div className="memory-view-layout">
            <div className="memory-view-content memory-view-content-graph">
              {profile ? (
                <MemoryGraph
                  agentLabel={agentMeta[selectedAgent].label}
                  onDraftEntryCorrection={onDraftEntryCorrection}
                  onDraftProfileCorrection={onDraftProfileCorrection}
                  onOpenSource={onOpenSource}
                  profile={profile}
                  profileStale={profileStale}
                  regenerating={isProfileRegenerating}
                  sources={sources}
                  truth={truth}
                  uiText={uiText}
                  writable={writable}
                />
              ) : renderProfilePlaceholder()}
            </div>
            <aside className="memory-overview-sidebar">{overviewPanel}</aside>
          </div>
        )}

        {view !== "graph" && (
          <div className="memory-view-layout">
            <div className="memory-view-content">
              {view === "profile" && renderProfilePlaceholder()}
        {view === "profile" && profile && (
          <div className="memory-profile-grid memory-profile-grid-single">
            {visibleSections.map((section) => {
              const state = memoryProfileSectionState(section, sources, truth);
              return (
                <article className={`memory-profile-section ${state}`} key={section.id}>
                  <header>
                    <span className={`profile-state ${state}`}>
                      {uiText.memorySummary.sectionState[state]}
                    </span>
                    <span>{uiText.memorySummary.evidenceCount(section.evidence.length)}</span>
                  </header>
                  <h2>{section.title}</h2>
                  <p>{section.body}</p>
                  <div className="memory-profile-actions">
                    {writable && (
                      <button
                        className="profile-edit-button"
                        disabled={profileStale || isProfileRegenerating}
                        onClick={() => onDraftProfileCorrection(section)}
                        type="button"
                      >
                        <PencilLine aria-hidden="true" size={14} />
                        {uiText.memorySummary.editMemory}
                      </button>
                    )}
                    <ProfileEvidenceDetails
                      onOpenSource={onOpenSource}
                      section={section}
                      sources={sources}
                      truth={truth}
                      uiText={uiText}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {view === "review" && (
          <section className="memory-review-center">
            <header className="memory-review-heading">
              <div>
                <p className="eyebrow">{uiText.memorySummary.reviewView}</p>
                <h2>{uiText.memorySummary.reviewCenterTitle}</h2>
                <p>{uiText.memorySummary.reviewCenterDescription}</p>
              </div>
            </header>

            {!hasReviewContent && (
              <div className="memory-profile-placeholder">
                <strong>{uiText.memorySummary.reviewEmptyTitle}</strong>
                <p>{uiText.memorySummary.reviewEmptyDescription}</p>
              </div>
            )}

            {reviewSections.length > 0 && (
              <section className="memory-review-group">
                <header>
                  <div>
                    <h3>{uiText.memorySummary.profileReviewTitle}</h3>
                    <p>{uiText.memorySummary.profileReviewDescription}</p>
                  </div>
                  <span className="memory-review-group-count">{reviewSections.length}</span>
                </header>
                <div className="memory-profile-grid memory-review-profile-grid">
                  {reviewSections.map((section) => (
                    <article className="memory-profile-section review" key={section.id}>
                      <header>
                        <span className="profile-state review">
                          {uiText.memorySummary.sectionState.review}
                        </span>
                        <span>{uiText.memorySummary.evidenceCount(section.evidence.length)}</span>
                      </header>
                      <h2>{section.title}</h2>
                      <p>{section.body}</p>
                      <div className="memory-profile-actions">
                        {writable && (
                          <button
                            className="profile-edit-button"
                            disabled={profileStale || isProfileRegenerating}
                            onClick={() => onDraftProfileCorrection(section)}
                            type="button"
                          >
                            <PencilLine aria-hidden="true" size={14} />
                            {uiText.memorySummary.editMemory}
                          </button>
                        )}
                        <ProfileEvidenceDetails
                          onOpenSource={onOpenSource}
                          section={section}
                          sources={sources}
                          truth={truth}
                          uiText={uiText}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {conflictReviewItems.length > 0 && (
              <section className="memory-review-group">
                <header>
                  <div>
                    <h3>{uiText.memorySummary.conflictReviewTitle}</h3>
                    <p>{uiText.memorySummary.conflictReviewDescription}</p>
                  </div>
                  <span className="memory-review-group-count conflict">
                    {conflictReviewItems.length}
                  </span>
                </header>
                <div className="memory-review-grid">
                  {conflictReviewItems.map((item) => (
                    <TruthReviewCard
                      item={item}
                      key={item.id}
                      onDraftCorrection={onDraftEntryCorrection}
                      onOpenSource={onOpenSource}
                      uiText={uiText}
                      writable={writable}
                    />
                  ))}
                </div>
              </section>
            )}

            {historicalReviewItems.length > 0 && (
              <details className="memory-review-archive">
                <summary>
                  <History aria-hidden="true" size={15} />
                  <span>{uiText.memorySummary.historyReviewTitle(historicalReviewItems.length)}</span>
                </summary>
                <p>{uiText.memorySummary.historyReviewDescription}</p>
                <div className="memory-review-grid">
                  {historicalReviewItems.map((item) => (
                    <TruthReviewCard
                      item={item}
                      key={item.id}
                      onDraftCorrection={onDraftEntryCorrection}
                      onOpenSource={onOpenSource}
                      uiText={uiText}
                      writable={writable}
                    />
                  ))}
                </div>
              </details>
            )}

            {uncertainReviewItems.length > 0 && (
              <details className="memory-review-archive">
                <summary>
                  <Lightbulb aria-hidden="true" size={15} />
                  <span>{uiText.memorySummary.uncertainReviewTitle(uncertainReviewItems.length)}</span>
                </summary>
                <p>{uiText.memorySummary.uncertainReviewDescription}</p>
                <div className="memory-review-grid">
                  {uncertainReviewItems.map((item) => (
                    <TruthReviewCard
                      item={item}
                      key={item.id}
                      onDraftCorrection={onDraftEntryCorrection}
                      onOpenSource={onOpenSource}
                      uiText={uiText}
                      writable={writable}
                    />
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        {view === "memories" && (
          <section className="memory-records">
            <div className="memory-records-heading">
              <div>
                <h2>{uiText.memorySummary.memoryListTitle}</h2>
                <p>{uiText.memorySummary.memoryListDescription}</p>
              </div>
              <div className="memory-records-actions">
                {writable && (
                  <button className="secondary-button compact" onClick={onDraftNewMemory} type="button">
                    <Plus aria-hidden="true" size={14} />
                    {uiText.memorySummary.addMemory}
                  </button>
                )}
                <label className="memory-search">
                  <Search aria-hidden="true" size={15} />
                  <input
                    aria-label={uiText.memorySummary.searchMemories}
                    onChange={(event) => setMemoryQuery(event.target.value)}
                    placeholder={uiText.memorySummary.searchMemories}
                    value={memoryQuery}
                  />
                </label>
              </div>
            </div>
            {visibleMemories.length > 0 ? (
              <div className="memory-record-list">
                {visibleMemories.map((entry) => {
                  const source = sources.find((item) => item.relativePath === entry.sourcePath);
                  return (
                    <article className="memory-record" key={entry.id}>
                      <div className="memory-record-meta">
                        <span>{uiText.memoryCards[entry.topic]}</span>
                        <span>{source ? uiText.sourceKinds[source.kind] : uiText.memorySummary.unknownSource}</span>
                      </div>
                      <h3>{entry.title}</h3>
                      <p>{entry.summary}</p>
                      <footer>
                        {source ? (
                          <button className="memory-source-link" onClick={() => onOpenSource(source.path)} type="button">
                            <FileText aria-hidden="true" size={13} />
                            {uiText.format.evidence(entry.sourcePath, entry.startLine, entry.endLine)}
                          </button>
                        ) : (
                          <span>{uiText.format.evidence(entry.sourcePath, entry.startLine, entry.endLine)}</span>
                        )}
                        {writable && (
                          <div className="memory-record-actions">
                            <button className="memory-record-edit" onClick={() => onDraftEntryCorrection(entry)} type="button">
                              <PencilLine aria-hidden="true" size={13} />
                              {uiText.memorySummary.editMemory}
                            </button>
                            {entry.change?.operation === "replace" && (
                              <button className="memory-record-edit revert" onClick={() => onDraftRevert(entry)} type="button">
                                <RotateCcw aria-hidden="true" size={13} />
                                {uiText.memorySummary.revertMemory}
                              </button>
                            )}
                          </div>
                        )}
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="memory-profile-placeholder">
                <strong>{uiText.memorySummary.noMemoryMatches}</strong>
              </div>
            )}
          </section>
        )}
            </div>
            <aside className="memory-overview-sidebar">{overviewPanel}</aside>
          </div>
        )}
      </section>
    </main>
  );
}
