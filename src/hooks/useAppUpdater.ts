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
  const pollingSequenceRef = useRef(0);
  const startupCheckStartedRef = useRef(false);
  const pollingRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const syncState = useCallback(async () => {
    const state = await window.backplane.app.getUpdateState();
    dispatch({ type: "stateReceived", state });
    return state;
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!enabled) return;
    const sequence = ++checkSequenceRef.current;
    dispatch({ type: "checkStarted" });
    try {
      const state = await window.backplane.app.checkForUpdates();
      if (sequence !== checkSequenceRef.current) return;
      dispatch({ type: "stateReceived", state });
    } catch (error) {
      if (sequence === checkSequenceRef.current) dispatch({ type: "failed", error: String(error) });
    }
  }, [enabled]);

  const downloadUpdate = useCallback(async () => {
    dispatch({ type: "downloadStarted" });
    stopPolling();
    const pollingSequence = ++pollingSequenceRef.current;
    pollingRef.current = window.setInterval(() => {
      void window.backplane.app.getUpdateState()
        .then((nextState) => {
          if (pollingSequence === pollingSequenceRef.current) {
            dispatch({ type: "stateReceived", state: nextState });
          }
        })
        .catch(() => undefined);
    }, 250);
    try {
      const nextState = await window.backplane.app.downloadUpdate();
      dispatch({ type: "stateReceived", state: nextState });
    } catch (error) {
      dispatch({ type: "failed", error: String(error) });
    } finally {
      pollingSequenceRef.current += 1;
      stopPolling();
    }
  }, [stopPolling]);

  const installUpdate = useCallback(async () => {
    dispatch({ type: "installStarted" });
    try {
      await window.backplane.app.installUpdate();
    } catch (error) {
      dispatch({ type: "failed", error: String(error) });
    }
  }, []);

  const setAutoCheck = useCallback((nextValue: boolean) => {
    setAutoCheckState(nextValue);
    writeAutoCheckUpdates(nextValue);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void syncState()
      .catch((error) => dispatch({ type: "failed", error: String(error) }));
  }, [enabled, syncState]);

  useEffect(() => {
    if (!enabled || !autoCheck || startupCheckStartedRef.current) return;
    startupCheckStartedRef.current = true;
    void checkForUpdates();
  }, [autoCheck, checkForUpdates, enabled]);

  useEffect(() => () => {
    checkSequenceRef.current += 1;
    pollingSequenceRef.current += 1;
    stopPolling();
  }, [stopPolling]);

  return { state, autoCheck, checkForUpdates, downloadUpdate, installUpdate, setAutoCheck };
}

export type AppUpdaterController = ReturnType<typeof useAppUpdater>;
