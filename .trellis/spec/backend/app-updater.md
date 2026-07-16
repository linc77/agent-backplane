# Application Updater Contract

## Scenario: Manual first-release updates from GitHub Releases

### 1. Scope / Trigger

Read this spec when changing the application version, Settings update UI,
GitHub release checks, signing, release workflow, or supported desktop targets.
The updater is application-global and never resets when the selected Agent
changes.

### 2. Signatures

```ts
useAppUpdater({ enabled: boolean }): {
  state: AppUpdateState;
  autoCheck: boolean;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  setAutoCheck(enabled: boolean): void;
}

window.amm.app.checkForUpdates(): Promise<AppUpdateInfo | null>
window.amm.app.openReleasePage(): Promise<void>
```

### 3. Contracts

- Main checks only
  `https://api.github.com/repos/linc77/agent-memory-manager/releases/latest`.
- Main compares the release tag with `app.getVersion()` and returns version,
  publication date, and body. Renderer does not fetch GitHub directly.
- `openReleasePage` opens the fixed AMM Releases URL; renderer cannot supply a
  URL.
- The preference key is `agent-memory-manager.auto-check-updates`; absence
  means enabled.
- The unsigned 0.2.x transition checks availability but never downloads,
  installs, relaunches, or claims installation success.
- Workflow artifacts are macOS ARM64 DMG/ZIP and Windows x64 NSIS.
- Signed automatic installation may return later as a separate contract; do
  not add an unsigned silent-update path.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Fixture/browser mode | Do not call Electron; show desktop-only state |
| GitHub request fails or times out | Retryable `error`; other workspaces remain usable |
| Latest release is not newer | `upToDate` |
| Newer release exists | `available` with version/notes |
| User clicks download | Open the fixed GitHub Releases page |
| Release is unsigned | Never claim download/install/relaunch success |

### 5. Good / Base / Bad Cases

- Good: startup check detects a newer release, Settings shows notes, and the
  user explicitly opens GitHub to download the correct installer.
- Base: latest release is older or equal; Settings reports current version.
- Bad: renderer accepts an arbitrary release URL or writes a downloaded binary.

### 6. Tests Required

- Reducer covers current version, checking, available, up-to-date, and
  retryable failure.
- Hook proves checking does not open GitHub and explicit `downloadUpdate()`
  does.
- Settings test uses truthful manual-download labels.
- Fixture UI never touches Electron APIs.
- Release workflow runs `pnpm verify` and builds both configured architectures.

### 7. Wrong vs Correct

#### Wrong

```ts
await unsignedUpdate.downloadAndInstall();
dispatch({ type: "installed" });
```

#### Correct

```ts
const update = await window.amm.app.checkForUpdates();
if (update) dispatch({ type: "updateAvailable", update });
// Only an explicit button calls openReleasePage().
```
