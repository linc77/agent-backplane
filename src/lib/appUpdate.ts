export const autoCheckUpdatesStorageKey = "agent-backplane.auto-check-updates";

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "unavailable"
  | "error";

export interface AppUpdateInfo {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
}

export interface AppUpdateState {
  supported: boolean;
  phase: AppUpdatePhase;
  currentVersion: string | null;
  update: AppUpdateInfo | null;
  progress: number | null;
  error: string | null;
}

export type AppUpdateAction =
  | { type: "stateReceived"; state: AppUpdateState }
  | { type: "checkStarted" }
  | { type: "downloadStarted" }
  | { type: "installStarted" }
  | { type: "failed"; error: string };

export const initialAppUpdateState: AppUpdateState = {
  supported: false,
  phase: "idle",
  currentVersion: null,
  update: null,
  progress: null,
  error: null,
};

export function appUpdateReducer(
  state: AppUpdateState,
  action: AppUpdateAction,
): AppUpdateState {
  switch (action.type) {
    case "stateReceived":
      return action.state;
    case "checkStarted":
      return {
        ...state,
        phase: "checking",
        progress: null,
        error: null,
      };
    case "downloadStarted":
      return {
        ...state,
        phase: "downloading",
        progress: 0,
        error: null,
      };
    case "installStarted":
      return { ...state, phase: "installing", error: null };
    case "failed":
      return { ...state, phase: "error", error: action.error };
  }
}

export function readAutoCheckUpdates(storage: Storage = window.localStorage) {
  try {
    return storage.getItem(autoCheckUpdatesStorageKey) !== "false";
  } catch {
    return true;
  }
}

export function writeAutoCheckUpdates(
  enabled: boolean,
  storage: Storage = window.localStorage,
) {
  try {
    storage.setItem(autoCheckUpdatesStorageKey, String(enabled));
  } catch {
    // Runtime state still updates when persistent storage is unavailable.
  }
}
