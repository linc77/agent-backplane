// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoCheckUpdatesStorageKey } from "../lib/appUpdate";
import { useAppUpdater } from "./useAppUpdater";

const getVersion = vi.fn();
const checkForUpdates = vi.fn();
const openReleasePage = vi.fn();

Object.defineProperty(window, "amm", {
  configurable: true,
  value: { app: { getVersion, checkForUpdates, openReleasePage } },
});
describe("useAppUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem(autoCheckUpdatesStorageKey, "false");
    getVersion.mockResolvedValue("0.2.0");
    checkForUpdates.mockResolvedValue({
      currentVersion: "0.2.0",
      version: "0.2.1",
      body: "Update notes",
    });
    openReleasePage.mockResolvedValue(undefined);
  });

  it("checks for a release and opens GitHub only after explicit confirmation", async () => {
    const { result } = renderHook(() => useAppUpdater({ enabled: true }));
    await waitFor(() => expect(result.current.state.currentVersion).toBe("0.2.0"));
    await act(() => result.current.checkForUpdates());
    expect(result.current.state.phase).toBe("available");
    expect(openReleasePage).not.toHaveBeenCalled();

    await act(() => result.current.downloadUpdate());
    expect(openReleasePage).toHaveBeenCalledOnce();
    expect(result.current.state.phase).toBe("available");
  });
});
