import type { ProxyConfig } from "electron";
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import type { AppUpdateInfo, AppUpdateState } from "../../../src/lib/appUpdate";

export interface UpdaterClient {
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  setFeedURL(options: UpdateFeed): void;
  on(event: "checking-for-update", listener: () => void): unknown;
  on(event: "update-available", listener: (info: UpdateInfo) => void): unknown;
  on(event: "update-not-available", listener: (info: UpdateInfo) => void): unknown;
  on(event: "download-progress", listener: (info: ProgressInfo) => void): unknown;
  on(event: "update-downloaded", listener: (info: UpdateDownloadedEvent) => void): unknown;
  on(event: "update-cancelled", listener: (info: UpdateInfo) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export type UpdateFeed =
  | {
      provider: "generic";
      url: string;
      useMultipleRangeRequest: false;
    }
  | {
      provider: "github";
      owner: string;
      repo: string;
    };

export const directUpdateFeedUrl = "https://github.com/linc77/agent-backplane/releases/latest/download";

export const updateFeeds: readonly UpdateFeed[] = [
  {
    provider: "generic",
    url: directUpdateFeedUrl,
    useMultipleRangeRequest: false,
  },
  {
    provider: "github",
    owner: "linc77",
    repo: "agent-backplane",
  },
];

export function proxyConfigFromResolution(resolution: string): ProxyConfig {
  const candidate = resolution
    .split(";")
    .map((part) => part.trim())
    .find((part) => part && part.toUpperCase() !== "DIRECT");
  if (!candidate) return { mode: "direct" };

  const [kind, address] = candidate.split(/\s+/, 2);
  if (!address) return { mode: "system" };
  switch (kind.toUpperCase()) {
    case "PROXY":
    case "HTTP":
      return { mode: "fixed_servers", proxyRules: address };
    case "HTTPS":
      return { mode: "fixed_servers", proxyRules: `https://${address}` };
    case "SOCKS":
    case "SOCKS5":
      return { mode: "fixed_servers", proxyRules: `socks5://${address}` };
    case "SOCKS4":
      return { mode: "fixed_servers", proxyRules: `socks4://${address}` };
    default:
      return { mode: "system" };
  }
}

export interface AppUpdaterService {
  getState(): AppUpdateState;
  checkForUpdates(): Promise<AppUpdateState>;
  downloadUpdate(): Promise<AppUpdateState>;
  installUpdate(): Promise<void>;
}

function releaseBody(info: UpdateInfo) {
  if (typeof info.releaseNotes === "string") return info.releaseNotes;
  if (!Array.isArray(info.releaseNotes)) return undefined;
  const notes = info.releaseNotes
    .map((item) => item.note)
    .filter((note): note is string => Boolean(note));
  return notes.length ? notes.join("\n\n") : undefined;
}

function updateInfo(currentVersion: string, info: UpdateInfo): AppUpdateInfo {
  return {
    currentVersion,
    version: info.version,
    date: info.releaseDate,
    body: releaseBody(info),
  };
}

export function sanitizeUpdateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (/Cannot find latest(?:-mac)?\.yml/i.test(message)) {
    return "Automatic update metadata is missing from the latest release.";
  }
  if (/signature|code object is not signed|notari[sz]/i.test(message)) {
    return "The downloaded update could not be verified by the operating system.";
  }
  if (/timed[ _-]?out|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONN|ERR_(?:NAME_NOT_RESOLVED|CONNECTION|INTERNET|NETWORK|PROXY|TUNNEL|ADDRESS_UNREACHABLE)/i.test(`${code} ${message}`)) {
    return "The update server could not be reached. Check your network and try again.";
  }
  return message
    .replace(/Headers:[\s\S]*/i, "")
    .replace(/https?:\/\/\S+/gi, "the update server")
    .replace(/(?:[A-Za-z]:\\|\/(?:Users|home|tmp)\/)[^\s]+/g, "a local path")
    .slice(0, 300);
}

export function createAppUpdaterService({
  currentVersion,
  isPackaged,
  prepareNetwork,
  updater,
}: {
  currentVersion: string;
  isPackaged: boolean;
  prepareNetwork?: () => Promise<void>;
  updater: UpdaterClient;
}): AppUpdaterService {
  let state: AppUpdateState = {
    supported: isPackaged,
    phase: isPackaged ? "idle" : "unavailable",
    currentVersion,
    update: null,
    progress: null,
    error: null,
  };

  const mergeState = (next: Partial<AppUpdateState>) => {
    state = { ...state, ...next };
  };
  const snapshot = () => ({
    ...state,
    update: state.update ? { ...state.update } : null,
  });
  let feedIndex = 0;

  const selectFeed = (index: number) => {
    feedIndex = index;
    updater.setFeedURL(updateFeeds[feedIndex]);
  };
  const prepareUpdaterNetwork = async () => {
    try {
      await prepareNetwork?.();
    } catch {
      // A proxy refresh failure should not prevent a direct update request.
    }
  };

  if (isPackaged) {
    selectFeed(feedIndex);
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;

    updater.on("checking-for-update", () => {
      mergeState({ phase: "checking", progress: null, error: null });
    });
    updater.on("update-available", (info) => {
      mergeState({
        phase: "available",
        update: updateInfo(currentVersion, info),
        progress: null,
        error: null,
      });
    });
    updater.on("update-not-available", () => {
      mergeState({ phase: "upToDate", update: null, progress: null, error: null });
    });
    updater.on("download-progress", (progress: ProgressInfo) => {
      mergeState({
        phase: "downloading",
        progress: Math.min(100, Math.max(0, Math.round(progress.percent * 10) / 10)),
        error: null,
      });
    });
    updater.on("update-downloaded", (info) => {
      mergeState({
        phase: "downloaded",
        update: updateInfo(currentVersion, info),
        progress: 100,
        error: null,
      });
    });
    updater.on("update-cancelled", () => {
      mergeState({ phase: state.update ? "available" : "idle", progress: null });
    });
    updater.on("error", (error) => {
      mergeState({ phase: "error", progress: null, error: sanitizeUpdateError(error) });
    });
  }

  return {
    getState: snapshot,
    async checkForUpdates() {
      if (!isPackaged) return snapshot();
      if (["downloading", "downloaded", "installing"].includes(state.phase)) return snapshot();
      mergeState({ phase: "checking", progress: null, error: null });
      await prepareUpdaterNetwork();
      try {
        await updater.checkForUpdates();
      } catch {
        selectFeed((feedIndex + 1) % updateFeeds.length);
        mergeState({ phase: "checking", progress: null, error: null });
        try {
          await updater.checkForUpdates();
          return snapshot();
        } catch (fallbackError) {
          mergeState({ phase: "error", progress: null, error: sanitizeUpdateError(fallbackError) });
          return snapshot();
        }
      }
      return snapshot();
    },
    async downloadUpdate() {
      if (!isPackaged) throw new Error("Automatic updates require an installed desktop build.");
      if (!state.update || !["available", "error"].includes(state.phase)) {
        throw new Error("No update is ready to download.");
      }
      mergeState({ phase: "downloading", progress: 0, error: null });
      await prepareUpdaterNetwork();
      try {
        await updater.downloadUpdate();
      } catch (error) {
        mergeState({ phase: "error", progress: null, error: sanitizeUpdateError(error) });
      }
      return snapshot();
    },
    async installUpdate() {
      if (state.phase !== "downloaded") throw new Error("No downloaded update is ready to install.");
      mergeState({ phase: "installing", error: null });
      try {
        updater.quitAndInstall(false, true);
      } catch (error) {
        const message = sanitizeUpdateError(error);
        mergeState({ phase: "error", error: message });
        throw new Error(message);
      }
    },
  };
}
