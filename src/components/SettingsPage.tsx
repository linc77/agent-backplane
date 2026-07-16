import { Languages, RefreshCw, Settings2 } from "lucide-react";
import type { AppUpdaterController } from "../hooks/useAppUpdater";
import { localeOptions, type Locale, type UiText } from "../lib/i18n";

export function SettingsPage({
  controller,
  locale,
  nativeEnabled,
  onLocaleChange,
  uiText,
}: {
  controller: AppUpdaterController;
  locale: Locale;
  nativeEnabled: boolean;
  onLocaleChange: (locale: Locale) => void;
  uiText: UiText;
}) {
  const { autoCheck, checkForUpdates, downloadUpdate, setAutoCheck, state } = controller;
  const busy = state.phase === "checking";
  const canInstall =
    Boolean(state.update) && (state.phase === "available" || state.phase === "error");

  return (
    <main className="settings-page">
      <header className="settings-page-heading">
        <p className="eyebrow">{uiText.settings.eyebrow}</p>
        <h1>{uiText.settings.title}</h1>
        <p>{uiText.settings.subtitle}</p>
      </header>

      <div className="settings-page-content">
        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Languages aria-hidden="true" size={18} />
            </span>
            <div>
              <h2>{uiText.settings.language}</h2>
              <p>{uiText.settings.languageHint}</p>
            </div>
          </div>

          <div
            className="settings-language-switch"
            role="group"
            aria-label={uiText.sidebar.languageLabel}
          >
            {localeOptions.map((option) => (
              <button
                aria-pressed={option.locale === locale}
                className={
                  option.locale === locale
                    ? "settings-language-option active"
                    : "settings-language-option"
                }
                key={option.locale}
                onClick={() => onLocaleChange(option.locale)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Settings2 aria-hidden="true" size={18} />
            </span>
            <div>
              <h2>{uiText.settings.appUpdate}</h2>
              <p>{uiText.settings.appUpdateHint}</p>
            </div>
          </div>

          <div className="settings-version-row">
            <span>{uiText.settings.currentVersion}</span>
            <strong>{state.currentVersion ?? uiText.settings.unknownVersion}</strong>
          </div>

          <label className="settings-toggle">
            <span>
              <strong>{uiText.settings.autoCheck}</strong>
              <small>{uiText.settings.autoCheckHint}</small>
            </span>
            <input
              checked={autoCheck}
              disabled={!nativeEnabled}
              onChange={(event) => setAutoCheck(event.target.checked)}
              type="checkbox"
            />
          </label>

          {!nativeEnabled ? (
            <p className="settings-status muted">{uiText.settings.desktopOnly}</p>
          ) : (
            <>
              {state.phase === "checking" && (
                <p className="settings-status">{uiText.settings.checking}</p>
              )}
              {state.phase === "upToDate" && (
                <p className="settings-status success">{uiText.settings.upToDate}</p>
              )}
              {state.update && (
                <div className="settings-update-card">
                  <strong>{uiText.settings.available(state.update.version)}</strong>
                  {state.update.body && (
                    <p className="settings-release-notes">{state.update.body}</p>
                  )}
                </div>
              )}
              {state.error && (
                <div className="settings-error" role="alert">
                  <strong>{uiText.settings.error}</strong>
                  <span>{state.error}</span>
                </div>
              )}

              <div className="settings-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void checkForUpdates()}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={15} />
                  {state.phase === "checking" ? uiText.settings.checking : uiText.settings.check}
                </button>
                {canInstall && (
                  <button
                    className="primary-button"
                    onClick={() => void downloadUpdate()}
                    type="button"
                  >
                    {uiText.settings.install}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
