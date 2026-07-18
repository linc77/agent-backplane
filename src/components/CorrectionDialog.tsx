import { X } from "lucide-react";
import type { UiText } from "../lib/i18n";
import type { CorrectionDraft } from "../lib/types";

export function CorrectionDialog({
  content,
  draft,
  isWriting,
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
  originalBody: string;
  originalTitle: string;
  uiText: UiText;
  onCancel: () => void;
  onContentChange: (content: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section aria-labelledby="correction-dialog-title" aria-modal="true" className="dialog correction-dialog" role="dialog">
        <header>
          <div>
            <p className="eyebrow">{uiText.dialog.eyebrow}</p>
            <h2 id="correction-dialog-title">{uiText.dialog.title}</h2>
          </div>
          <button aria-label={uiText.dialog.cancel} className="icon-button" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </header>

        <section className="correction-current">
          <span>{uiText.dialog.currentMemory}</span>
          <strong>{originalTitle}</strong>
          <p>{originalBody}</p>
        </section>

        <label>
          {uiText.dialog.correctMemory}
          <textarea
            aria-label={uiText.dialog.correctMemory}
            autoFocus
            onChange={(event) => onContentChange(event.target.value)}
            placeholder={uiText.dialog.correctionPlaceholder}
            rows={6}
            value={content}
          />
          <small>{uiText.dialog.correctionHint}</small>
        </label>

        <details className="correction-write-details">
          <summary>{uiText.dialog.writeDetails}</summary>
          <code>{draft.targetPath}</code>
        </details>

        <footer>
          <button className="secondary-button" onClick={onCancel} type="button">
            {uiText.dialog.cancel}
          </button>
          <button
            className="primary-button"
            disabled={isWriting || !content.trim()}
            onClick={onConfirm}
            type="button"
          >
            {isWriting ? uiText.dialog.writing : uiText.dialog.writeCorrection}
          </button>
        </footer>
      </section>
    </div>
  );
}
