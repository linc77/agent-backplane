// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoCheckUpdatesStorageKey } from "../lib/appUpdate";
import { useAppUpdater } from "./useAppUpdater";

const getUpdateState = vi.fn();
const checkForUpdates = vi.fn();
const downloadUpdate = vi.fn();
const installUpdate = vi.fn();

Object.defineProperty(window, "backplane", {
  configurable: true,
  value: { app: { getUpdateState, checkForUpdates, downloadUpdate, installUpdate } },
});
describe("useAppUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem(autoCheckUpdatesStorageKey, "false");
    getUpdateState.mockResolvedValue({
      supported: true,
      phase: "idle",
      currentVersion: "0.2.0",
      update: null,
      progress: null,
      error: null,
    });
    checkForUpdates.mockResolvedValue({
      supported: true,
      phase: "available",
      currentVersion: "0.2.0",
      update: {
        currentVersion: "0.2.0",
        version: "0.2.1",
        body: "Update notes",
      },
      progress: null,
      error: null,
    });
    downloadUpdate.mockResolvedValue({
      supported: true,
      phase: "downloaded",
      currentVersion: "0.2.0",
      update: { currentVersion: "0.2.0", version: "0.2.1" },
      progress: 100,
      error: null,
    });
    installUpdate.mockResolvedValue(undefined);
  });

  it("checks, downloads, and installs only after explicit confirmation", async () => {
    const { result } = renderHook(() => useAppUpdater({ enabled: true }));
    await waitFor(() => expect(result.current.state.currentVersion).toBe("0.2.0"));
    await act(() => result.current.checkForUpdates());
    expect(result.current.state.phase).toBe("available");
    expect(downloadUpdate).not.toHaveBeenCalled();

    await act(() => result.current.downloadUpdate());
    expect(downloadUpdate).toHaveBeenCalledOnce();
    expect(result.current.state.phase).toBe("downloaded");

    await act(() => result.current.installUpdate());
    expect(installUpdate).toHaveBeenCalledOnce();
    expect(result.current.state.phase).toBe("installing");
  });
});
