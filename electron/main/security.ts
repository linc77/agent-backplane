import type { BrowserWindow } from "electron";
import { session } from "electron";
import { isTrustedRendererUrl } from "./windowPolicy";

export function lockDownSession() {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

export function lockDownWindow(window: BrowserWindow, developmentOrigin?: string) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, developmentOrigin)) {
      event.preventDefault();
    }
  });
}
