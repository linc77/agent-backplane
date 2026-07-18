import { Languages, RefreshCw, Settings2 } from "lucide-react";
import type { AppUpdaterController } from "../hooks/useAppUpdater";
import { localeOptions, type Locale, type UiText } from "../lib/i18n";
import { PageHeader } from "./PageHeader";

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
  const { autoCheck, checkForUpdates, downloadUpdate, installUpdate, setAutoCheck, state } = controller;
  const updaterEnabled = nativeEnabled && state.supported;
  const busy = ["checking", "downloading", "installing"].includes(state.phase);
  const canDownload =
    Boolean(state.update) && (state.phase === "available" || state.phase === "error");
  const canInstall = state.phase === "downloaded";

  return (
    <main className="settings-page">
      <PageHeader
        className="settings-page-heading"
        title={uiText.settings.title}
        description={uiText.settings.subtitle}
      />

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
              disabled={!updaterEnabled}
              onChange={(event) => setAutoCheck(event.target.checked)}
              type="checkbox"
            />
          </label>

          {!updaterEnabled ? (
            <p className="settings-status muted">{uiText.settings.desktopOnly}</p>
          ) : (
            <>
              {state.phase === "checking" && (
                <p className="settings-status">{uiText.settings.checking}</p>
              )}
              {state.phase === "upToDate" && (
                <p className="settings-status success">{uiText.settings.upToDate}</p>
              )}
              {state.phase === "downloading" && (
                <div className="settings-progress">
                  <strong>{uiText.settings.downloading(state.progress)}</strong>
                  <progress max="100" value={state.progress ?? 0} />
                </div>
              )}
              {state.phase === "downloaded" && (
                <p className="settings-status success">{uiText.settings.downloaded}</p>
              )}
              {state.phase === "installing" && (
                <p className="settings-status">{uiText.settings.installing}</p>
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
                  disabled={busy || canInstall}
                  onClick={() => void checkForUpdates()}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={15} />
                  {state.phase === "checking" ? uiText.settings.checking : uiText.settings.check}
                </button>
                {canDownload && (
                  <button
                    className="primary-button"
                    onClick={() => void downloadUpdate()}
                    type="button"
                  >
                    {uiText.settings.download}
                  </button>
                )}
                {canInstall && (
                  <button
                    className="primary-button"
                    onClick={() => void installUpdate()}
                    type="button"
                  >
                    {uiText.settings.restartAndInstall}
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
