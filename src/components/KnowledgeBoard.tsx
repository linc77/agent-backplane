import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  PencilLine,
  RefreshCw,
  Search,
  SearchCheck,
} from "lucide-react";
import { useState } from "react";
import { agentMeta } from "../lib/agentScope";
import {
  entriesForView,
  findSourceForEntry,
  isSourceView,
  sourcesForView,
  type MemoryView,
} from "../lib/memoryViews";
import {
  resolveMemoryTruth,
  truthItemForEvidence,
  type MemoryTruthModel,
  type MemoryTruthStatus,
} from "../lib/memoryTruth";
import type { UiText } from "../lib/i18n";
import type {
  CodexAuditMode,
  CodexAuditRun,
  EvidenceRef,
  MemoryClaim,
  MemoryConflict,
  MemoryEntry,
  MemoryProfile,
  MemoryProfileSection,
  MemorySource,
  ScanResult,
  SuggestedCorrection,
  AgentKind,
} from "../lib/types";

type EvidenceTrustStatus = MemoryTruthStatus;

function evidenceLabel(evidence: EvidenceRef, uiText: UiText) {
  return uiText.format.evidence(evidence.sourcePath, evidence.startLine, evidence.endLine);
}

function renderEvidenceRefs(
  evidenceItems: EvidenceRef[],
  sources: MemorySource[],
  onOpenSource: (path: string) => void,
  uiText: UiText,
) {
  return evidenceItems.map((evidence) => {
    const label = evidenceLabel(evidence, uiText);
    const source = sources.find((item) => item.relativePath === evidence.sourcePath);
    return source ? (
      <button
        className="evidence-link"
        key={`${evidence.sourcePath}:${evidence.startLine}-${evidence.endLine}`}
        onClick={() => onOpenSource(source.path)}
        type="button"
      >
        {label}
      </button>
    ) : (
      <span key={`${evidence.sourcePath}:${evidence.startLine}-${evidence.endLine}`}>{label}</span>
    );
  });
}

function renderProfileEvidenceRefs(
  evidenceItems: EvidenceRef[],
  sources: MemorySource[],
  truth: MemoryTruthModel,
  onOpenSource: (path: string) => void,
  uiText: UiText,
) {
  return evidenceItems.map((evidence) => {
    const label = evidenceLabel(evidence, uiText);
    const source = sources.find((item) => item.relativePath === evidence.sourcePath);
    const trustStatus = evidenceTrustStatus(evidence, source, truth);
    const sourceControl = source ? (
      <button
        className="evidence-link"
        onClick={() => onOpenSource(source.path)}
        type="button"
      >
        {label}
      </button>
    ) : (
      <span>{label}</span>
    );

    return (
      <div
        className={`profile-evidence-row ${trustStatus}`}
        key={`${evidence.sourcePath}:${evidence.startLine}-${evidence.endLine}`}
      >
        <div className="profile-evidence-main">
          {sourceControl}
          <span className={`evidence-status ${trustStatus}`}>
            {uiText.memorySummary.evidenceTrust[trustStatus]}
          </span>
        </div>
        <span className="profile-evidence-summary">{evidence.summary}</span>
        <span className="profile-evidence-note">
          {uiText.memorySummary.evidenceTrustNotes[trustStatus]}
        </span>
      </div>
    );
  });
}

function evidenceTrustStatus(
  evidence: EvidenceRef,
  source: MemorySource | undefined,
  truth: MemoryTruthModel,
): EvidenceTrustStatus {
  const truthItem = truthItemForEvidence(truth, evidence);
  if (truthItem) {
    return truthItem.status;
  }

  if (source?.kind === "chronicle") {
    return "uncertain";
  }
  if (source?.kind === "raw" || source?.kind === "rolloutSummary") {
    return "stale";
  }
  if (!source) {
    return "uncertain";
  }

  return "current";
}

function renderClaim(
  claim: MemoryClaim,
  sources: MemorySource[],
  onOpenSource: (path: string) => void,
  uiText: UiText,
) {
  return (
    <article className="audit-card" key={claim.id}>
      <div className="audit-card-header">
        <strong>{claim.field}</strong>
        <span>{Math.round(claim.confidence * 100)}%</span>
      </div>
      <p>{claim.value}</p>
      <p className="audit-rationale">{claim.rationale}</p>
      <footer>{renderEvidenceRefs(claim.evidence, sources, onOpenSource, uiText)}</footer>
    </article>
  );
}

function renderConflict(
  conflict: MemoryConflict,
  sources: MemorySource[],
  onOpenSource: (path: string) => void,
  uiText: UiText,
) {
  return (
    <article className="audit-card warning" key={conflict.id}>
      <div className="audit-card-header">
        <strong>{conflict.title}</strong>
        <span>{Math.round(conflict.confidence * 100)}%</span>
      </div>
      <p>{conflict.detail}</p>
      <footer>{renderEvidenceRefs(conflict.evidence, sources, onOpenSource, uiText)}</footer>
    </article>
  );
}

function renderCorrection(
  correction: SuggestedCorrection,
  onDraftSuggestedCorrection: (correction: SuggestedCorrection) => void,
  sources: MemorySource[],
  onOpenSource: (path: string) => void,
  uiText: UiText,
) {
  return (
    <article className="audit-card" key={correction.id}>
      <div className="audit-card-header">
        <strong>{correction.title}</strong>
        <span>{Math.round(correction.confidence * 100)}%</span>
      </div>
      <p>{correction.reason}</p>
      <pre>{correction.content}</pre>
      <button
        className="secondary-button compact"
        onClick={() => onDraftSuggestedCorrection(correction)}
        type="button"
      >
        <PencilLine size={15} />
        {uiText.board.draftCorrection}
      </button>
      <footer>{renderEvidenceRefs(correction.evidence, sources, onOpenSource, uiText)}</footer>
    </article>
  );
}

function sourceMatches(source: MemorySource, lowerQuery: string, uiText: UiText) {
  return (
    !lowerQuery ||
    `${source.relativePath} ${source.kind} ${uiText.sourceKinds[source.kind]} ${source.sha256}`
      .toLowerCase()
      .includes(lowerQuery)
  );
}

function entryMatches(entry: MemoryEntry, lowerQuery: string) {
  return (
    !lowerQuery ||
    `${entry.title} ${entry.summary} ${entry.searchText} ${entry.sourcePath}`
      .toLowerCase()
      .includes(lowerQuery)
  );
}

function sectionMatches(section: MemoryProfileSection, lowerQuery: string) {
  return (
    !lowerQuery ||
    `${section.title} ${section.body} ${section.evidence
      .map((item) => `${item.sourcePath} ${item.summary}`)
      .join(" ")}`
      .toLowerCase()
      .includes(lowerQuery)
  );
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
    <details onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary
        onClick={(event) => {
          const details = event.currentTarget.parentElement as HTMLDetailsElement | null;
          setIsOpen(!(details?.open ?? false));
        }}
      >
        {uiText.memorySummary.viewEvidence}
      </summary>
      {isOpen && (
        <div className="memory-profile-evidence">
          <div className="profile-certainty">
            <strong>{uiText.memorySummary.evidence}</strong>
            <span>
              {uiText.memorySummary.stability[section.stability]} /{" "}
              {uiText.memorySummary.confidence[section.confidence]}
            </span>
          </div>
          <div className="profile-evidence-list">
            {renderProfileEvidenceRefs(section.evidence, sources, truth, onOpenSource, uiText)}
          </div>
        </div>
      )}
    </details>
  );
}

function renderMemoryProfile({
  isProfileLoading,
  isProfileRegenerating,
  onCancelProfileGeneration,
  onDraftProfileCorrection,
  onOpenSource,
  onRegenerateProfile,
  profile,
  profileError,
  sections,
  sources,
  selectedAgent,
  uiText,
  truth,
  writable,
  headingLevel = "h2",
  variant = "detail",
}: {
  isProfileLoading: boolean;
  isProfileRegenerating: boolean;
  headingLevel?: "h1" | "h2";
  variant?: "overview" | "detail";
  profile?: MemoryProfile;
  profileError?: unknown;
  sections: MemoryProfileSection[];
  sources: MemorySource[];
  selectedAgent: AgentKind;
  truth: MemoryTruthModel;
  uiText: UiText;
  writable: boolean;
  onDraftProfileCorrection: (section: MemoryProfileSection) => void;
  onCancelProfileGeneration: () => void;
  onOpenSource: (path: string) => void;
  onRegenerateProfile: () => void;
}) {
  const Heading = headingLevel;
  const isOverviewProfile = variant === "overview";

  return (
    <section className={`memory-profile ${isOverviewProfile ? "overview-profile" : "detail-profile"}`}>
      <header className="memory-profile-header">
        {!isOverviewProfile && <p className="eyebrow">{uiText.memorySummary.eyebrow}</p>}
        <div className="memory-profile-title-row">
          <div>
            <Heading>{uiText.memorySummary.title(agentMeta[selectedAgent].label)}</Heading>
            {profile && (
              <span className="profile-source-note">
                {uiText.memorySummary.generatedBy(
                  profile.generator,
                  profile.metadata.currentEntries,
                )}
              </span>
            )}
          </div>
          {writable && (
            <button
              className="secondary-button compact"
              onClick={isProfileRegenerating ? onCancelProfileGeneration : onRegenerateProfile}
              type="button"
            >
              <Bot size={15} />
              {isProfileRegenerating
                ? uiText.memorySummary.cancelGeneration
                : uiText.memorySummary.regenerate}
            </button>
          )}
        </div>
      </header>
      {(isProfileLoading || isProfileRegenerating) && (
        <div className="profile-inline-state">{uiText.memorySummary.loading}</div>
      )}
      {Boolean(profileError) && <div className="audit-error">{String(profileError)}</div>}
      {!isProfileLoading && !sections.length && (
        <div className="empty-state">{uiText.memorySummary.emptyTitle}</div>
      )}
      <div className="memory-profile-essay">
        {sections.map((section) => (
          <article className="memory-profile-section" key={section.id}>
            <div className="memory-profile-section-header">
              <h3>{section.title}</h3>
              {!isOverviewProfile && (
                <span>
                  {uiText.memorySummary.stability[section.stability]} /{" "}
                  {uiText.memorySummary.confidence[section.confidence]}
                </span>
              )}
            </div>
            <p>{section.body}</p>
            <div className="memory-profile-actions">
              {writable && (
                <button
                  className="secondary-button compact quiet"
                  onClick={() => onDraftProfileCorrection(section)}
                  type="button"
                >
                  <PencilLine size={15} />
                  {uiText.memorySummary.wrong}
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
  );
}

export function KnowledgeBoard({
  activeTopic,
  auditError,
  auditMode,
  auditRun,
  isAuditRunning,
  isProfileLoading,
  isProfileRegenerating,
  profile,
  profileError,
  query,
  scan,
  selectedEntryId,
  selectedAgent,
  onAuditModeChange,
  onQueryChange,
  onRefresh,
  onRunCodexAudit,
  onCancelProfileGeneration,
  onRegenerateProfile,
  onDraftProfileCorrection,
  onDraftSuggestedCorrection,
  onOpenSource,
  onSelectTopic,
  onSelectEntry,
  uiText,
  writable,
}: {
  activeTopic: MemoryView;
  auditError?: unknown;
  auditMode: CodexAuditMode;
  auditRun: CodexAuditRun | null;
  isAuditRunning: boolean;
  isProfileLoading: boolean;
  isProfileRegenerating: boolean;
  profile?: MemoryProfile;
  profileError?: unknown;
  query: string;
  scan?: ScanResult;
  selectedEntryId?: string;
  selectedAgent: AgentKind;
  uiText: UiText;
  writable: boolean;
  onAuditModeChange: (mode: CodexAuditMode) => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onRunCodexAudit: () => void;
  onCancelProfileGeneration: () => void;
  onRegenerateProfile: () => void;
  onDraftProfileCorrection: (section: MemoryProfileSection) => void;
  onDraftSuggestedCorrection: (correction: SuggestedCorrection) => void;
  onOpenSource: (path: string) => void;
  onSelectTopic: (topic: "effective" | "audit") => void;
  onSelectEntry: (entry: MemoryEntry) => void;
}) {
  const lowerQuery = query.trim().toLowerCase();
  const isAuditView = activeTopic === "audit";
  const isOverview = activeTopic === "overview";
  const showSearch = activeTopic !== "overview" && !isAuditView;
  const sourceCards = sourcesForView(activeTopic, scan).filter((source) =>
    sourceMatches(source, lowerQuery, uiText),
  );
  const entries = entriesForView(activeTopic, scan).filter((entry) =>
    entryMatches(entry, lowerQuery),
  );
  const profileSections = (profile?.sections ?? []).filter((section) =>
    sectionMatches(section, lowerQuery),
  );
  const sources = scan?.sources ?? [];
  const truth = resolveMemoryTruth(scan);
  const boardTitle = uiText.views[activeTopic];
  const resultSummary =
    showSearch && lowerQuery
      ? activeTopic === "effective"
        ? uiText.memorySummary.matchingSections(profileSections.length)
        : isSourceView(activeTopic) && activeTopic !== "corrections"
        ? uiText.board.matchingSources(sourceCards.length)
        : uiText.board.matchingEntries(entries.length)
      : undefined;

  return (
    <main className="board">
      {selectedAgent === "codex" && (activeTopic === "effective" || isAuditView) && (
        <nav className="memory-workspace-nav" aria-label={uiText.board.memoryNavigation}>
          <button
            aria-current={activeTopic === "effective" ? "page" : undefined}
            className={
              activeTopic === "effective"
                ? "memory-workspace-nav-item active"
                : "memory-workspace-nav-item"
            }
            onClick={() => onSelectTopic("effective")}
            type="button"
          >
            <BookOpen aria-hidden="true" size={15} />
            {uiText.views.effective}
          </button>
          <button
            aria-current={isAuditView ? "page" : undefined}
            className={
              isAuditView
                ? "memory-workspace-nav-item active"
                : "memory-workspace-nav-item"
            }
            onClick={() => onSelectTopic("audit")}
            type="button"
          >
            <SearchCheck aria-hidden="true" size={15} />
            {uiText.views.audit}
          </button>
        </nav>
      )}

      {!isOverview && (
        <header className="toolbar">
          <div>
            <p className="eyebrow">{uiText.board.eyebrow}</p>
            <h1>{boardTitle}</h1>
            {resultSummary && <span className="toolbar-meta">{resultSummary}</span>}
          </div>
          <div className="toolbar-actions">
            {isAuditView && (
              <>
                <select
                  aria-label={uiText.board.auditMode}
                  className="mode-select"
                  disabled={isAuditRunning}
                  onChange={(event) => onAuditModeChange(event.target.value as CodexAuditMode)}
                  value={auditMode}
                >
                  <option value="curated">{uiText.auditModes.curated}</option>
                  <option value="full">{uiText.auditModes.full}</option>
                </select>
                <button
                  className="secondary-button compact"
                  onClick={onRunCodexAudit}
                  type="button"
                >
                  <Bot size={16} />
                  {isAuditRunning ? uiText.board.cancelAudit : uiText.board.runAudit}
                </button>
              </>
            )}
            {showSearch && (
              <label className="search-box">
                <Search size={16} />
                <input
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder={uiText.board.searchPlaceholder}
                  value={query}
                />
              </label>
            )}
            <button
              className="icon-button"
              onClick={onRefresh}
              title={uiText.board.rescanMemory}
              type="button"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
      )}

      {activeTopic === "overview" &&
        renderMemoryProfile({
          headingLevel: "h1",
          isProfileLoading,
          isProfileRegenerating,
          onCancelProfileGeneration,
          onDraftProfileCorrection,
          onOpenSource,
          onRegenerateProfile,
          profile,
          profileError,
          sections: profileSections,
          selectedAgent,
          sources,
          truth,
          uiText,
          variant: "overview",
          writable,
        })}

      {activeTopic === "effective" &&
        renderMemoryProfile({
          isProfileLoading,
          isProfileRegenerating,
          onCancelProfileGeneration,
          onDraftProfileCorrection,
          onOpenSource,
          onRegenerateProfile,
          profile,
          profileError,
          sections: profileSections,
          selectedAgent,
          sources,
          truth,
          uiText,
          writable,
        })}

      {isAuditView && (
        <section className="audit-panel">
          <div className="audit-panel-header">
            <div>
              <p className="eyebrow">{uiText.views.audit}</p>
              <h2>{auditRun ? auditRun.report.summary : uiText.board.noAuditReport}</h2>
            </div>
            {auditRun && (
              <span>
                {uiText.auditModes[auditRun.report.mode]} ·{" "}
                {uiText.board.auditEntries(auditRun.report.metadata.inputEntries)}
              </span>
            )}
          </div>
          {auditError ? <div className="audit-error">{String(auditError)}</div> : null}
          {auditRun && (
            <div className="audit-sections">
              <section>
                <h3>
                  <CheckCircle2 size={15} />
                  {uiText.board.currentClaims}
                </h3>
                <div className="audit-grid">
                  {auditRun.report.currentClaims.map((claim) =>
                    renderClaim(claim, sources, onOpenSource, uiText),
                  )}
                </div>
              </section>
              <section>
                <h3>
                  <AlertCircle size={15} />
                  {uiText.board.staleClaims}
                </h3>
                <div className="audit-grid">
                  {auditRun.report.staleClaims.map((claim) =>
                    renderClaim(claim, sources, onOpenSource, uiText),
                  )}
                </div>
              </section>
              <section>
                <h3>
                  <Clock size={15} />
                  {uiText.board.uncertainClaims}
                </h3>
                <div className="audit-grid">
                  {auditRun.report.uncertainClaims.map((claim) =>
                    renderClaim(claim, sources, onOpenSource, uiText),
                  )}
                </div>
              </section>
              <section>
                <h3>
                  <AlertCircle size={15} />
                  {uiText.board.conflicts}
                </h3>
                <div className="audit-grid">
                  {auditRun.report.conflicts.map((conflict) =>
                    renderConflict(conflict, sources, onOpenSource, uiText),
                  )}
                </div>
              </section>
              <section>
                <h3>
                  <Clock size={15} />
                  {uiText.board.suggestedCorrections}
                </h3>
                <div className="audit-grid">
                  {auditRun.report.suggestedCorrections.map((correction) =>
                    renderCorrection(
                      correction,
                      onDraftSuggestedCorrection,
                      sources,
                      onOpenSource,
                      uiText,
                    ),
                  )}
                </div>
              </section>
            </div>
          )}
        </section>
      )}

      {!isAuditView && activeTopic !== "overview" && isSourceView(activeTopic) && activeTopic !== "corrections" ? (
        <section className="source-grid">
          {sourceCards.map((source) => (
            <article className="source-card" key={source.id}>
              <FileSearch size={18} />
              <div>
                <strong>{source.relativePath}</strong>
                <span>
                  {uiText.format.sourceMeta(
                    uiText.sourceKinds[source.kind],
                    source.lines,
                    Math.round(source.bytes / 1024),
                  )}
                </span>
              </div>
              <button
                aria-label={uiText.board.openSourceAria(source.relativePath)}
                className="icon-button source-open-button"
                onClick={() => onOpenSource(source.path)}
                title={uiText.board.openSource}
                type="button"
              >
                <ExternalLink size={15} />
              </button>
            </article>
          ))}
          {!sourceCards.length && <div className="empty-state">{uiText.board.noSourceMatches}</div>}
        </section>
      ) : null}

      {!isAuditView &&
      activeTopic !== "overview" &&
      activeTopic !== "effective" &&
      (!isSourceView(activeTopic) || activeTopic === "corrections") ? (
        <section className="entry-grid">
          {entries.map((entry) => {
            const source = findSourceForEntry(scan?.sources ?? [], entry);
            const risk = scan?.risks.find((item) => item.entryId === entry.id);
            return (
              <article
                className={entry.id === selectedEntryId ? "entry-card selected" : "entry-card"}
                key={entry.id}
                onClick={() => onSelectEntry(entry)}
              >
                <div className="entry-card-header">
                  <strong>{entry.title}</strong>
                  <div className="entry-badges">
                    <span className="topic-badge">{uiText.topics[entry.topic]}</span>
                    {source && <span className="source-badge">{uiText.sourceKinds[source.kind]}</span>}
                    {risk && <span className="risk-badge">{uiText.riskKinds[risk.kind]}</span>}
                  </div>
                </div>
                <p>{entry.summary}</p>
                <footer>
                  <span>{source?.relativePath ?? entry.sourcePath}</span>
                  <span>{uiText.format.lineRange(entry.startLine, entry.endLine)}</span>
                </footer>
              </article>
            );
          })}
          {!entries.length && <div className="empty-state">{uiText.board.noEntryMatches}</div>}
        </section>
      ) : null}
    </main>
  );
}
