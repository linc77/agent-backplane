import { X } from "lucide-react";
import type { UiText } from "../lib/i18n";
import type { CorrectionDraft } from "../lib/types";

export function CorrectionDialog({
  draft,
  isWriting,
  uiText,
  onCancel,
  onContentChange,
  onConfirm,
}: {
  draft: CorrectionDraft;
  isWriting: boolean;
  uiText: UiText;
  onCancel: () => void;
  onContentChange: (content: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section className="dialog">
        <header>
          <div>
            <p className="eyebrow">{uiText.dialog.eyebrow}</p>
            <h2>{uiText.dialog.title}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </header>

        <label>
          {uiText.dialog.targetPath}
          <input readOnly value={draft.targetPath} />
        </label>

        <label>
          {uiText.dialog.content}
          <textarea
            onChange={(event) => onContentChange(event.target.value)}
            rows={10}
            value={draft.content}
          />
        </label>

        <footer>
          <button className="secondary-button" onClick={onCancel} type="button">
            {uiText.dialog.cancel}
          </button>
          <button className="primary-button" disabled={isWriting} onClick={onConfirm} type="button">
            {isWriting ? uiText.dialog.writing : uiText.dialog.writeCorrection}
          </button>
        </footer>
      </section>
    </div>
  );
}
