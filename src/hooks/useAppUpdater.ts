import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  appUpdateReducer,
  initialAppUpdateState,
  readAutoCheckUpdates,
  writeAutoCheckUpdates,
} from "../lib/appUpdate";

export function useAppUpdater({ enabled }: { enabled: boolean }) {
  const [state, dispatch] = useReducer(appUpdateReducer, initialAppUpdateState);
  const [autoCheck, setAutoCheckState] = useState(() => readAutoCheckUpdates());
  const checkSequenceRef = useRef(0);
  const startupCheckStartedRef = useRef(false);

  const checkForUpdates = useCallback(async () => {
    if (!enabled) return;
    const sequence = ++checkSequenceRef.current;
    dispatch({ type: "checkStarted" });
    try {
      const update = await window.amm.app.checkForUpdates();
      if (sequence !== checkSequenceRef.current) return;
      dispatch(update ? { type: "updateAvailable", update } : { type: "upToDate" });
    } catch (error) {
      if (sequence === checkSequenceRef.current) dispatch({ type: "failed", error: String(error) });
    }
  }, [enabled]);

  const downloadUpdate = useCallback(async () => {
    if (!state.update) {
      dispatch({ type: "failed", error: "No pending update is available." });
      return;
    }
    await window.amm.app.openReleasePage();
  }, [state.update]);

  const setAutoCheck = useCallback((nextValue: boolean) => {
    setAutoCheckState(nextValue);
    writeAutoCheckUpdates(nextValue);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void window.amm.app.getVersion()
      .then((version) => dispatch({ type: "currentVersionLoaded", version }))
      .catch((error) => dispatch({ type: "failed", error: String(error) }));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !autoCheck || startupCheckStartedRef.current) return;
    startupCheckStartedRef.current = true;
    void checkForUpdates();
  }, [autoCheck, checkForUpdates, enabled]);

  useEffect(() => () => {
    checkSequenceRef.current += 1;
  }, []);

  return { state, autoCheck, checkForUpdates, downloadUpdate, setAutoCheck };
}

export type AppUpdaterController = ReturnType<typeof useAppUpdater>;
