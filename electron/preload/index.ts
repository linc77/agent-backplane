import { contextBridge, ipcRenderer } from "electron";
import type { AmmDesktopApi } from "../shared/api";
import { channels } from "../shared/channels";

const api: AmmDesktopApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(channels.appVersion),
    checkForUpdates: () => ipcRenderer.invoke(channels.checkAppUpdate),
    openReleasePage: () => ipcRenderer.invoke(channels.openReleasePage),
  },
  memory: {
    scan: (rootOverride = null) => ipcRenderer.invoke(channels.scanMemories, { rootOverride }),
    generateProfile: (rootOverride = null) =>
      ipcRenderer.invoke(channels.generateMemoryProfile, { rootOverride }),
    startProfileGeneration: (rootOverride = null) =>
      ipcRenderer.invoke(channels.startMemoryProfileGeneration, { rootOverride }),
    getProfileGeneration: () => ipcRenderer.invoke(channels.getMemoryProfileGeneration),
    cancelProfileGeneration: () => ipcRenderer.invoke(channels.cancelMemoryProfileGeneration),
    loadProfile: (rootOverride = null) =>
      ipcRenderer.invoke(channels.loadMemoryProfile, { rootOverride }),
    loadAgentSnapshot: (agent) =>
      ipcRenderer.invoke(channels.loadAgentMemorySnapshot, { agent }),
    getSourceExcerpt: (rootOverride, path, startLine, endLine) =>
      ipcRenderer.invoke(channels.getSourceExcerpt, {
        rootOverride,
        path,
        startLine,
        endLine,
      }),
    draftCorrection: (rootOverride, slug, bulletLines) =>
      ipcRenderer.invoke(channels.draftCorrection, { rootOverride, slug, bulletLines }),
    draftCorrectionFromContent: (rootOverride, slug, content) =>
      ipcRenderer.invoke(channels.draftCorrectionFromContent, { rootOverride, slug, content }),
    writeCorrection: (rootOverride, draft) =>
      ipcRenderer.invoke(channels.writeCorrection, { rootOverride, draft }),
  },
  audit: {
    start: (rootOverride, mode) => ipcRenderer.invoke(channels.startCodexAudit, { rootOverride, mode }),
    get: () => ipcRenderer.invoke(channels.getCodexAudit),
    cancel: () => ipcRenderer.invoke(channels.cancelCodexAudit),
    run: (rootOverride, mode) => ipcRenderer.invoke(channels.runCodexAudit, { rootOverride, mode }),
  },
  skills: {
    load: (projectRootOverride = null) =>
      ipcRenderer.invoke(channels.loadSkillInventory, { projectRootOverride }),
  },
  agentConfig: {
    load: () => ipcRenderer.invoke(channels.loadAgentConfigInventory),
    save: (input) => ipcRenderer.invoke(channels.saveAgentProviderProfile, { input }),
    delete: (agent, profileId) =>
      ipcRenderer.invoke(channels.deleteAgentProviderProfile, { agent, profileId }),
    activate: (agent, profileId) =>
      ipcRenderer.invoke(channels.activateAgentProviderProfile, { agent, profileId }),
  },
  mcp: {
    load: (agent) => ipcRenderer.invoke(channels.loadMcpInventory, { agent }),
  },
  shell: {
    revealSource: (path) => ipcRenderer.invoke(channels.revealSource, { path }),
  },
};

contextBridge.exposeInMainWorld("amm", api);
