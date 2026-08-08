import {
  ExternalLink,
  FileText,
  LayoutGrid,
  List,
  Network,
  PencilLine,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { agentMeta } from "../lib/agentScope";
import type { Locale, UiText } from "../lib/i18n";
import {
  resolveMemoryTruth,
  type MemoryTruthModel,
} from "../lib/memoryTruth";
import {
  memoryEvidenceTrustStatus,
  memoryProfileSectionState,
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

type BoardView = "graph" | "profile" | "memories";
const overviewSidebarCollapsedStorageKey = "agent-backplane.memory-overview-collapsed";
const overviewSidebarWidthStorageKey = "agent-backplane.memory-overview-width";
const defaultOverviewSidebarWidth = 292;
const minOverviewSidebarWidth = 240;
const maxOverviewSidebarWidth = 480;
const minOverviewContentWidth = 480;

function clampOverviewSidebarWidth(width: number, containerWidth = Number.POSITIVE_INFINITY) {
  const availableMaximum = Number.isFinite(containerWidth)
    ? Math.max(minOverviewSidebarWidth, containerWidth - minOverviewContentWidth)
    : maxOverviewSidebarWidth;
  return Math.min(
    Math.max(Math.round(width), minOverviewSidebarWidth),
    Math.min(maxOverviewSidebarWidth, availableMaximum),
  );
}

function readOverviewSidebarCollapsed() {
  try {
    return window.localStorage.getItem(overviewSidebarCollapsedStorageKey) === "true";
  } catch {
    return false;
  }
}

function readOverviewSidebarWidth() {
  try {
    const stored = Number(window.localStorage.getItem(overviewSidebarWidthStorageKey));
    return Number.isFinite(stored) && stored > 0
      ? clampOverviewSidebarWidth(stored)
      : defaultOverviewSidebarWidth;
  } catch {
    return defaultOverviewSidebarWidth;
  }
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
  const [isOverviewSidebarCollapsed, setIsOverviewSidebarCollapsed] = useState(
    readOverviewSidebarCollapsed,
  );
  const [overviewSidebarWidth, setOverviewSidebarWidth] = useState(
    readOverviewSidebarWidth,
  );
  const [isOverviewSidebarResizing, setIsOverviewSidebarResizing] = useState(false);
  const profileRef = useRef<HTMLElement | null>(null);
  const overviewResizeRef = useRef<{
    containerWidth: number;
    startWidth: number;
    startX: number;
  } | null>(null);
  const sources = scan?.sources ?? [];
  const truth = useMemo(() => resolveMemoryTruth(scan), [scan]);
  const currentMemories = truth.current.map((item) => item.entry);
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

  useEffect(() => {
    if (!isOverviewSidebarResizing) return;

    function handlePointerMove(event: globalThis.PointerEvent) {
      const drag = overviewResizeRef.current;
      if (!drag) return;
      setOverviewSidebarWidth(
        clampOverviewSidebarWidth(
          drag.startWidth + drag.startX - event.clientX,
          drag.containerWidth,
        ),
      );
    }

    function handlePointerEnd() {
      overviewResizeRef.current = null;
      setIsOverviewSidebarResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [isOverviewSidebarResizing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        overviewSidebarWidthStorageKey,
        String(overviewSidebarWidth),
      );
    } catch {
      // Keep the in-memory width when storage is unavailable.
    }
  }, [overviewSidebarWidth]);

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

  function toggleOverviewSidebar() {
    setIsOverviewSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(overviewSidebarCollapsedStorageKey, String(next));
      } catch {
        // Keep the in-memory preference when storage is unavailable.
      }
      return next;
    });
  }

  function startOverviewSidebarResize(event: PointerEvent<HTMLDivElement>) {
    const measuredWidth = profileRef.current?.getBoundingClientRect().width ?? 0;
    const containerWidth = measuredWidth > 0 ? measuredWidth : window.innerWidth;
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    overviewResizeRef.current = {
      containerWidth,
      startWidth: overviewSidebarWidth,
      startX: event.clientX,
    };
    setIsOverviewSidebarResizing(true);
  }

  function nudgeOverviewSidebarResize(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const measuredWidth = profileRef.current?.getBoundingClientRect().width ?? 0;
    const containerWidth = measuredWidth > 0 ? measuredWidth : window.innerWidth;
    const step = event.shiftKey ? 48 : 16;
    const delta = event.key === "ArrowLeft" ? step : -step;
    setOverviewSidebarWidth((width) =>
      clampOverviewSidebarWidth(width + delta, containerWidth),
    );
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

  const overviewToggleButton = (
    <button
      aria-label={
        isOverviewSidebarCollapsed
          ? uiText.memorySummary.expandOverviewSidebar
          : uiText.memorySummary.collapseOverviewSidebar
      }
      className="memory-overview-collapse-button"
      onClick={toggleOverviewSidebar}
      title={
        isOverviewSidebarCollapsed
          ? uiText.memorySummary.expandOverviewSidebar
          : uiText.memorySummary.collapseOverviewSidebar
      }
      type="button"
    >
      {isOverviewSidebarCollapsed
        ? <PanelRightOpen aria-hidden="true" size={16} />
        : <PanelRightClose aria-hidden="true" size={16} />}
    </button>
  );

  const overviewSidebar = isOverviewSidebarCollapsed
    ? null
    : (
        <>
          <div
            aria-label={uiText.memorySummary.resizeOverviewSidebar}
            aria-orientation="vertical"
            aria-valuemax={maxOverviewSidebarWidth}
            aria-valuemin={minOverviewSidebarWidth}
            aria-valuenow={overviewSidebarWidth}
            className={
              isOverviewSidebarResizing
                ? "memory-overview-resizer active"
                : "memory-overview-resizer"
            }
            onKeyDown={nudgeOverviewSidebarResize}
            onPointerDown={startOverviewSidebarResize}
            role="separator"
            tabIndex={0}
          />
          <aside className="memory-overview-sidebar">
            <div className="memory-overview-sidebar-header">{overviewToggleButton}</div>
            {overviewPanel}
          </aside>
        </>
      );

  return (
    <main className="board memory-board">
      <section
        className={`memory-profile${isOverviewSidebarCollapsed ? " overview-collapsed" : ""}${isOverviewSidebarResizing ? " overview-resizing" : ""}`}
        ref={profileRef}
        style={{ "--memory-sidebar-width": `${overviewSidebarWidth}px` } as CSSProperties}
      >

        {(profile || currentMemories.length > 0 || isOverviewSidebarCollapsed) && (
          <div className="memory-view-toolbar">
            {(profile || currentMemories.length > 0) && (
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
                  aria-pressed={view === "graph"}
                  className={view === "graph" ? "active" : ""}
                  onClick={() => setView("graph")}
                  type="button"
                >
                  <Network aria-hidden="true" size={15} />
                  {uiText.memorySummary.graphView}
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
            )}
            {isOverviewSidebarCollapsed && overviewToggleButton}
          </div>
        )}

        {view === "graph" && (
          <div
            className={`memory-view-layout${isOverviewSidebarCollapsed ? " overview-collapsed" : ""}`}
          >
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
            {overviewSidebar}
          </div>
        )}

        {view !== "graph" && (
          <div
            className={`memory-view-layout${isOverviewSidebarCollapsed ? " overview-collapsed" : ""}`}
          >
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
            {overviewSidebar}
          </div>
        )}
      </section>
    </main>
  );
}
