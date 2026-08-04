import { X } from "lucide-react";
import type { UiText } from "../lib/i18n";
import type { CorrectionDraft } from "../lib/types";

export type CorrectionDialogMode = "edit" | "create" | "revert";

export function CorrectionDialog({
  content,
  draft,
  isWriting,
  mode,
  originalBody,
  originalTitle,
  uiText,
  onCancel,
  onContentChange,
  onConfirm,
}: {
  content: string;
  draft: CorrectionDraft;
  isWriting: boolean;
  mode: CorrectionDialogMode;
  originalBody: string;
  originalTitle: string;
  uiText: UiText;
  onCancel: () => void;
  onContentChange: (content: string) => void;
  onConfirm: () => void;
}) {
  const isCreate = mode === "create";
  const isRevert = mode === "revert";
  const eyebrow = isCreate
    ? uiText.dialog.addEyebrow
    : isRevert
      ? uiText.dialog.revertEyebrow
      : uiText.dialog.eyebrow;
  const title = isCreate
    ? uiText.dialog.addTitle
    : isRevert
      ? uiText.dialog.revertTitle
      : uiText.dialog.title;
  const fieldLabel = isCreate ? uiText.dialog.addMemoryPrompt : uiText.dialog.correctMemory;
  const fieldHint = isCreate ? uiText.dialog.addMemoryHint : uiText.dialog.correctionHint;
  const fieldPlaceholder = isCreate
    ? uiText.dialog.addMemoryPlaceholder
    : uiText.dialog.correctionPlaceholder;
  const confirmLabel = isCreate
    ? uiText.dialog.writeMemory
    : isRevert
      ? uiText.dialog.revertChange
      : uiText.dialog.writeCorrection;
  const affectedCount = draft.change.targetEntryIds.length;

  return (
    <div className="dialog-backdrop">
      <section aria-labelledby="correction-dialog-title" aria-modal="true" className="dialog correction-dialog" role="dialog">
        <header>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="correction-dialog-title">{title}</h2>
          </div>
          <button aria-label={uiText.dialog.cancel} className="icon-button" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </header>

        {!isCreate && (
          <section className="correction-current">
            <span>{uiText.dialog.currentMemory}</span>
            <strong>{originalTitle}</strong>
            <p>{originalBody}</p>
          </section>
        )}

        {isRevert ? (
          <p className="correction-revert-hint">{uiText.dialog.revertHint}</p>
        ) : (
          <label>
            {fieldLabel}
            <textarea
              aria-label={fieldLabel}
              autoFocus
              onChange={(event) => onContentChange(event.target.value)}
              placeholder={fieldPlaceholder}
              rows={6}
              value={content}
            />
            <small>{fieldHint}</small>
          </label>
        )}

        <div className={`correction-impact${affectedCount ? " targeted" : " append"}`}>
          {affectedCount
            ? uiText.dialog.affectedMemories(affectedCount)
            : uiText.dialog.noExistingMemoryAffected}
        </div>

        <details className="correction-write-details">
          <summary>{uiText.dialog.writeDetails}</summary>
          <dl>
            <div>
              <dt>{uiText.dialog.targetPath}</dt>
              <dd><code>{draft.targetPath}</code></dd>
            </div>
            {draft.targetSourcePaths.length > 0 && (
              <div>
                <dt>{uiText.dialog.targetSources}</dt>
                <dd>
                  <ul>
                    {draft.targetSourcePaths.map((path) => <li key={path}>{path}</li>)}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </details>

        <footer>
          <button className="secondary-button" onClick={onCancel} type="button">
            {uiText.dialog.cancel}
          </button>
          <button
            className="primary-button"
            disabled={isWriting || (!isRevert && !content.trim())}
            onClick={onConfirm}
            type="button"
          >
            {isWriting ? uiText.dialog.writing : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
