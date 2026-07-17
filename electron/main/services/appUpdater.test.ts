import { EventEmitter } from "node:events";
import type { UpdateInfo } from "electron-updater";
import { describe, expect, it, vi } from "vitest";
import {
  createAppUpdaterService,
  proxyConfigFromResolution,
  sanitizeUpdateError,
  type UpdaterClient,
} from "./appUpdater";

function updateInfo(version = "0.3.0") {
  return {
    version,
    files: [],
    path: `Agent.Memory.Manager_${version}_arm64.zip`,
    sha512: "sha512",
    releaseDate: "2026-07-16T00:00:00Z",
    releaseNotes: "Updater release",
  } as UpdateInfo;
}

function fakeUpdater() {
  const emitter = new EventEmitter();
  const updater = Object.assign(emitter, {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    checkForUpdates: vi.fn(async () => {
      emitter.emit("checking-for-update");
      emitter.emit("update-available", updateInfo());
      return null;
    }),
    downloadUpdate: vi.fn(async () => {
      emitter.emit("download-progress", { percent: 42.34 });
      emitter.emit("update-downloaded", { ...updateInfo(), downloadedFile: "/tmp/update.zip" });
      return ["/tmp/update.zip"];
    }),
    quitAndInstall: vi.fn(),
    setFeedURL: vi.fn(),
  }) satisfies UpdaterClient;
  return updater;
}

describe("Electron app updater service", () => {
  it("keeps update operations unavailable outside packaged builds", async () => {
    const updater = fakeUpdater();
    const service = createAppUpdaterService({
      currentVersion: "0.2.1",
      isPackaged: false,
      updater,
    });

    expect(service.getState()).toMatchObject({ supported: false, phase: "unavailable" });
    await service.checkForUpdates();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("checks, downloads, and installs a stable update explicitly", async () => {
    const updater = fakeUpdater();
    const prepareNetwork = vi.fn(async () => undefined);
    const service = createAppUpdaterService({
      currentVersion: "0.2.1",
      isPackaged: true,
      prepareNetwork,
      updater,
    });

    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.setFeedURL).toHaveBeenCalledWith({
      provider: "generic",
      url: "https://github.com/linc77/agent-backplane/releases/latest/download",
      useMultipleRangeRequest: false,
    });

    expect(await service.checkForUpdates()).toMatchObject({
      phase: "available",
      update: { version: "0.3.0", body: "Updater release" },
    });
    expect(await service.downloadUpdate()).toMatchObject({
      phase: "downloaded",
      progress: 100,
    });

    await service.installUpdate();
    expect(service.getState().phase).toBe("installing");
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
    expect(prepareNetwork).toHaveBeenCalledTimes(2);
  });

  it("maps the resolved Windows system proxy into the updater session", () => {
    expect(proxyConfigFromResolution("PROXY 127.0.0.1:7890; DIRECT")).toEqual({
      mode: "fixed_servers",
      proxyRules: "127.0.0.1:7890",
    });
    expect(proxyConfigFromResolution("SOCKS5 127.0.0.1:1080; DIRECT")).toEqual({
      mode: "fixed_servers",
      proxyRules: "socks5://127.0.0.1:1080",
    });
    expect(proxyConfigFromResolution("DIRECT")).toEqual({ mode: "direct" });
  });

  it("retries a failed direct check through the GitHub provider", async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates
      .mockRejectedValueOnce(Object.assign(new Error("net::ERR_NAME_NOT_RESOLVED"), {
        code: "ERR_NAME_NOT_RESOLVED",
      }))
      .mockImplementationOnce(async () => {
        updater.emit("checking-for-update");
        updater.emit("update-available", updateInfo("0.5.1"));
        return null;
      });
    const service = createAppUpdaterService({
      currentVersion: "0.5.0",
      isPackaged: true,
      updater,
    });

    expect(await service.checkForUpdates()).toMatchObject({
      phase: "available",
      update: { version: "0.5.1" },
      error: null,
    });
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(updater.setFeedURL).toHaveBeenLastCalledWith({
      provider: "github",
      owner: "linc77",
      repo: "agent-backplane",
    });
  });

  it("removes URLs and local paths from errors crossing IPC", () => {
    const message = sanitizeUpdateError(
      new Error("Failed https://example.com/latest.yml at /Users/demo/Downloads/update.zip"),
    );

    expect(message).not.toContain("https://");
    expect(message).not.toContain("/Users/demo");
    expect(sanitizeUpdateError(new Error("Cannot find latest-mac.yml in release artifacts")))
      .toBe("Automatic update metadata is missing from the latest release.");
    expect(sanitizeUpdateError(new Error("net::ERR_NAME_NOT_RESOLVED")))
      .toBe("The update server could not be reached. Check your network and try again.");
  });
});
