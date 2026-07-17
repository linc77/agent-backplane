import { ExternalLink, PencilLine, RefreshCw } from "lucide-react";
import { useState } from "react";
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
  MemoryProfile,
  MemoryProfileSection,
  MemorySource,
  ScanResult,
} from "../lib/types";

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
              <article
                className={`profile-evidence-row ${status}`}
                key={`${evidence.sourcePath}:${evidence.startLine}-${evidence.endLine}`}
              >
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
                <p>{evidence.summary}</p>
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

export function KnowledgeBoard({
  isProfileLoading,
  isProfileRegenerating,
  locale,
  onCancelProfileGeneration,
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
  onOpenSource: (path: string) => void;
}) {
  const sources = scan?.sources ?? [];
  const truth = resolveMemoryTruth(scan);
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

        {isProfileLoading && !profile && (
          <div className="memory-profile-placeholder" aria-live="polite">
            <strong>{uiText.memorySummary.loading}</strong>
          </div>
        )}

        {!isProfileLoading && !profile && !hasMemory && (
          <div className="memory-profile-placeholder">
            <strong>{uiText.memorySummary.emptyTitle}</strong>
            <p>{uiText.memorySummary.emptyDescription}</p>
          </div>
        )}

        {!isProfileLoading && !profile && hasMemory && !isProfileRegenerating && !profileError && (
          <div className="memory-profile-placeholder">
            <strong>{uiText.memorySummary.readyTitle}</strong>
            <p>{uiText.memorySummary.readyDescription}</p>
          </div>
        )}

        {profile && (
          <div className="memory-profile-essay">
            {profile.sections.map((section) => (
              <article className="memory-profile-section" key={section.id}>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
                <div className="memory-profile-actions">
                  {writable && (
                    <button
                      className="profile-text-button"
                      onClick={() => onDraftProfileCorrection(section)}
                      type="button"
                    >
                      <PencilLine aria-hidden="true" size={14} />
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
        )}
      </section>
    </main>
  );
}
