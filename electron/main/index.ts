import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { registerIpcHandlers, removeIpcHandlers } from "./ipc/register";
import { handleAppScheme, registerAppScheme } from "./protocol";
import { lockDownSession, lockDownWindow } from "./security";
import { mainWindowOptions } from "./windowPolicy";

registerAppScheme();

function createMainWindow() {
  const developmentOrigin = process.env.ELECTRON_RENDERER_URL;
  const window = new BrowserWindow({
    ...mainWindowOptions,
    webPreferences: {
      ...mainWindowOptions.webPreferences,
      preload: join(import.meta.dirname, "../preload/index.cjs"),
    },
  });

  lockDownWindow(window, developmentOrigin);
  registerIpcHandlers(window, developmentOrigin);
  window.once("ready-to-show", () => {
    window.center();
    window.show();
    window.focus();
  });
  window.on("closed", () => {
    removeIpcHandlers();
  });

  if (developmentOrigin) {
    void window.loadURL(developmentOrigin);
  } else {
    void window.loadURL("app://renderer/index.html");
  }
}

app.setName("Agent Memory Manager");
app.setAppUserModelId("com.linc.agent-memory-manager");

void app.whenReady().then(() => {
  handleAppScheme(join(import.meta.dirname, "../renderer"));
  lockDownSession();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
