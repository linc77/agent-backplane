export const autoCheckUpdatesStorageKey = "agent-memory-manager.auto-check-updates";

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "error";

export interface AppUpdateInfo {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
}

export interface AppUpdateState {
  phase: AppUpdatePhase;
  currentVersion: string | null;
  update: AppUpdateInfo | null;
  error: string | null;
}

export type AppUpdateAction =
  | { type: "currentVersionLoaded"; version: string }
  | { type: "checkStarted" }
  | { type: "upToDate" }
  | { type: "updateAvailable"; update: AppUpdateInfo }
  | { type: "failed"; error: string };

export const initialAppUpdateState: AppUpdateState = {
  phase: "idle",
  currentVersion: null,
  update: null,
  error: null,
};

export function appUpdateReducer(
  state: AppUpdateState,
  action: AppUpdateAction,
): AppUpdateState {
  switch (action.type) {
    case "currentVersionLoaded":
      return { ...state, currentVersion: action.version };
    case "checkStarted":
      return {
        ...state,
        phase: "checking",
        update: null,
        error: null,
      };
    case "upToDate":
      return { ...state, phase: "upToDate", update: null, error: null };
    case "updateAvailable":
      return {
        ...state,
        phase: "available",
        currentVersion: action.update.currentVersion,
        update: action.update,
        error: null,
      };
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
