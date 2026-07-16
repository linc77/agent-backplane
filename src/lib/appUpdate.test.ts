// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  appUpdateReducer,
  autoCheckUpdatesStorageKey,
  initialAppUpdateState,
  readAutoCheckUpdates,
  writeAutoCheckUpdates,
} from "./appUpdate";

describe("app update state", () => {
  it("tracks release availability without starting a download", () => {
    const available = appUpdateReducer(initialAppUpdateState, {
      type: "updateAvailable",
      update: { currentVersion: "0.2.0", version: "0.2.1", body: "Fixes" },
    });
    expect(available.phase).toBe("available");
    expect(available.update?.version).toBe("0.2.1");
  });

  it("keeps update metadata after a release check failure", () => {
    const available = appUpdateReducer(initialAppUpdateState, {
      type: "updateAvailable",
      update: { currentVersion: "0.2.0", version: "0.2.1" },
    });
    const failed = appUpdateReducer(available, { type: "failed", error: "network error" });
    expect(failed.phase).toBe("error");
    expect(failed.update?.version).toBe("0.2.1");
  });

  it("defaults startup checks to enabled and persists an explicit opt-out", () => {
    window.localStorage.clear();
    expect(readAutoCheckUpdates()).toBe(true);
    writeAutoCheckUpdates(false);
    expect(window.localStorage.getItem(autoCheckUpdatesStorageKey)).toBe("false");
    expect(readAutoCheckUpdates()).toBe(false);
  });
});
