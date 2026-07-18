import {
  AlertTriangle,
  ExternalLink,
  FileText,
  LayoutGrid,
  List,
  PencilLine,
  RefreshCw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { agentMeta } from "../lib/agentScope";
import type { Locale, UiText } from "../lib/i18n";
import {
  resolveMemoryTruth,
  truthItemForEvidence,
  type MemoryTruthModel,
  type MemoryTruthStatus,
} from "../lib/memoryTruth";
import type {
  AgentKind,
  EvidenceRef,
  MemoryEntry,
  MemoryProfile,
  MemoryProfileSection,
  MemorySource,
  ScanResult,
} from "../lib/types";

type BoardView = "profile" | "memories";
type ProfileSectionState = "steady" | "recent" | "review";

function evidenceTrustStatus(
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

function profileSectionState(
  section: MemoryProfileSection,
  sources: MemorySource[],
  truth: MemoryTruthModel,
): ProfileSectionState {
  const evidenceStatuses = section.evidence.map((evidence) =>
    evidenceTrustStatus(
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
            const status = evidenceTrustStatus(evidence, source, truth);
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

export function KnowledgeBoard({
  isProfileLoading,
  isProfileRegenerating,
  locale,
  onCancelProfileGeneration,
  onDraftEntryCorrection,
  onDraftProfileCorrection,
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
  onOpenSource: (path: string) => void;
}) {
  const [view, setView] = useState<BoardView>("profile");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [memoryQuery, setMemoryQuery] = useState("");
  const sources = scan?.sources ?? [];
  const truth = useMemo(() => resolveMemoryTruth(scan), [scan]);
  const currentMemories = truth.current.map((item) => item.entry);
  const reviewSections = (profile?.sections ?? []).filter(
    (section) => profileSectionState(section, sources, truth) === "review",
  );
  const visibleSections = reviewOnly && reviewSections.length > 0
    ? reviewSections
    : profile?.sections ?? [];
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

  function showReviewSections() {
    if (!reviewSections.length) return;
    setView("profile");
    setReviewOnly(true);
  }

  return (
    <main className="board memory-board">
      <section className="memory-profile">
        <header className="memory-profile-header">
          <div className="memory-profile-heading">
            <p className="eyebrow">{uiText.memorySummary.eyebrow}</p>
            <h1>{uiText.memorySummary.title(agentMeta[selectedAgent].label)}</h1>
            <p className="memory-profile-description">
              {uiText.memorySummary.description(agentMeta[selectedAgent].label)}
            </p>
          </div>
          <button
            className="secondary-button compact"
            disabled={isProfileLoading || (!hasMemory && !profile)}
            onClick={
              isProfileRegenerating ? onCancelProfileGeneration : onRegenerateProfile
            }
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} />
            {isProfileRegenerating
              ? uiText.memorySummary.cancelGeneration
              : uiText.memorySummary.updateProfile}
          </button>
        </header>

        {(profile || currentMemories.length > 0) && (
          <div className="memory-overview" aria-label={uiText.memorySummary.overviewLabel}>
            <div className="memory-overview-item">
              <strong>{profile?.sections.length ?? 0}</strong>
              <span>{uiText.memorySummary.profileThemes}</span>
            </div>
            <button className="memory-overview-item" onClick={() => setView("memories")} type="button">
              <strong>{currentMemories.length}</strong>
              <span>{uiText.memorySummary.currentMemories}</span>
            </button>
            <button
              className={`memory-overview-item attention${reviewSections.length ? " has-items" : ""}`}
              disabled={!reviewSections.length}
              onClick={showReviewSections}
              type="button"
            >
              <strong>{reviewSections.length}</strong>
              <span>{uiText.memorySummary.needsAttention}</span>
            </button>
          </div>
        )}

        {profile && (
          <p className="profile-source-note">
            {uiText.memorySummary.generatedAt(
              formatGeneratedAt(profile.generatedAt, locale),
              profile.metadata.currentEntries,
            )}
          </p>
        )}

        {statusMessage && (
          <div
            aria-live="polite"
            className={`memory-profile-status ${profileError ? "error" : ""}`}
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

        {(profile || currentMemories.length > 0) && (
          <div className="memory-view-toolbar">
            <div aria-label={uiText.memorySummary.viewLabel} className="memory-view-switch" role="group">
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
                aria-pressed={view === "memories"}
                className={view === "memories" ? "active" : ""}
                onClick={() => setView("memories")}
                type="button"
              >
                <List aria-hidden="true" size={15} />
                {uiText.memorySummary.memoryView}
              </button>
            </div>
            {view === "profile" && reviewSections.length > 0 && (
              <button
                aria-pressed={reviewOnly}
                className={`memory-review-filter${reviewOnly ? " active" : ""}`}
                onClick={() => setReviewOnly((value) => !value)}
                type="button"
              >
                <AlertTriangle aria-hidden="true" size={14} />
                {reviewOnly
                  ? uiText.memorySummary.showAll
                  : uiText.memorySummary.showNeedsAttention(reviewSections.length)}
              </button>
            )}
          </div>
        )}

        {view === "profile" && isProfileLoading && !profile && (
          <div className="memory-profile-placeholder" aria-live="polite">
            <strong>{uiText.memorySummary.loading}</strong>
          </div>
        )}

        {view === "profile" && !isProfileLoading && !profile && !hasMemory && (
          <div className="memory-profile-placeholder">
            <strong>{uiText.memorySummary.emptyTitle}</strong>
            <p>{uiText.memorySummary.emptyDescription}</p>
          </div>
        )}

        {view === "profile" && !isProfileLoading && !profile && hasMemory && !isProfileRegenerating && !profileError && (
          <div className="memory-profile-placeholder">
            <strong>{uiText.memorySummary.readyTitle}</strong>
            <p>{uiText.memorySummary.readyDescription}</p>
          </div>
        )}

        {view === "profile" && profile && (
          <div className="memory-profile-grid">
            {visibleSections.map((section) => {
              const state = profileSectionState(section, sources, truth);
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

        {view === "memories" && (
          <section className="memory-records">
            <div className="memory-records-heading">
              <div>
                <h2>{uiText.memorySummary.memoryListTitle}</h2>
                <p>{uiText.memorySummary.memoryListDescription}</p>
              </div>
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
                          <button className="memory-record-edit" onClick={() => onDraftEntryCorrection(entry)} type="button">
                            <PencilLine aria-hidden="true" size={13} />
                            {uiText.memorySummary.editMemory}
                          </button>
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
      </section>
    </main>
  );
}
