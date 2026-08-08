import { contextBridge, ipcRenderer } from "electron";
import type { BackplaneDesktopApi } from "../shared/api";
import { channels } from "../shared/channels";

const api: BackplaneDesktopApi = {
  app: {
    getUpdateState: () => ipcRenderer.invoke(channels.getAppUpdateState),
    checkForUpdates: () => ipcRenderer.invoke(channels.checkAppUpdate),
    downloadUpdate: () => ipcRenderer.invoke(channels.downloadAppUpdate),
    installUpdate: () => ipcRenderer.invoke(channels.installAppUpdate),
  },
  memory: {
    scan: (rootOverride = null) => ipcRenderer.invoke(channels.scanMemories, { rootOverride }),
    startProfileGeneration: (agent, locale) =>
      ipcRenderer.invoke(channels.startMemoryProfileGeneration, { agent, locale }),
    getProfileGeneration: () => ipcRenderer.invoke(channels.getMemoryProfileGeneration),
    cancelProfileGeneration: () => ipcRenderer.invoke(channels.cancelMemoryProfileGeneration),
    loadAgentSnapshot: (agent, locale) =>
      ipcRenderer.invoke(channels.loadAgentMemorySnapshot, { agent, locale }),
    getSourceExcerpt: (rootOverride, path, startLine, endLine) =>
      ipcRenderer.invoke(channels.getSourceExcerpt, {
        rootOverride,
        path,
        startLine,
        endLine,
      }),
    draftCorrection: (agent, rootOverride, slug, bulletLines, targets) =>
      ipcRenderer.invoke(channels.draftCorrection, { agent, rootOverride, slug, bulletLines, targets }),
    draftCorrectionFromContent: (agent, rootOverride, slug, content, targets) =>
      ipcRenderer.invoke(channels.draftCorrectionFromContent, { agent, rootOverride, slug, content, targets }),
    draftRevert: (agent, rootOverride, change, sourcePath) =>
      ipcRenderer.invoke(channels.draftRevert, { agent, rootOverride, change, sourcePath }),
    writeCorrection: (rootOverride, draft) =>
      ipcRenderer.invoke(channels.writeCorrection, { rootOverride, draft }),
  },
  skills: {
    load: (projectRootOverride = null) =>
      ipcRenderer.invoke(channels.loadSkillInventory, { projectRootOverride }),
    loadUsage: (targets) => ipcRenderer.invoke(channels.loadSkillUsage, { targets }),
    saveManifest: (input, projectRootOverride = null) =>
      ipcRenderer.invoke(channels.saveSkillManifest, { input, projectRootOverride }),
    loadWorkspace: () => ipcRenderer.invoke(channels.loadSkillWorkspace, {}),
    chooseProject: () => ipcRenderer.invoke(channels.chooseSkillProject, {}),
    saveSelection: (input) => ipcRenderer.invoke(channels.saveProjectSkillSelection, input),
    saveProfile: (input) => ipcRenderer.invoke(channels.saveSkillProfile, input),
    deleteProfile: (profileId) => ipcRenderer.invoke(channels.deleteSkillProfile, { profileId }),
    applyProfile: (input) => ipcRenderer.invoke(channels.applySkillProfile, input),
    syncProject: (projectId, agent) =>
      ipcRenderer.invoke(channels.syncProjectSkills, { projectId, agent }),
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
  modelGateway: {
    loadProviders: () => ipcRenderer.invoke(channels.loadModelGatewayProviders),
    saveProvider: (input) => ipcRenderer.invoke(channels.saveModelGatewayProvider, input),
    deleteProvider: (id) => ipcRenderer.invoke(channels.deleteModelGatewayProvider, { id }),
    discover: (input) => ipcRenderer.invoke(channels.discoverModelGateway, input),
    benchmark: (input) => ipcRenderer.invoke(channels.benchmarkModelGateway, input),
    probe: (input) => ipcRenderer.invoke(channels.probeModelGateway, input),
    startTest: (input) => ipcRenderer.invoke(channels.startModelGatewayTest, input),
    getTest: () => ipcRenderer.invoke(channels.getModelGatewayTest),
    cancelTest: () => ipcRenderer.invoke(channels.cancelModelGatewayTest),
    loadMonitors: () => ipcRenderer.invoke(channels.loadModelGatewayMonitors),
    saveMonitor: (input) => ipcRenderer.invoke(channels.saveModelGatewayMonitor, input),
    deleteMonitor: (id) => ipcRenderer.invoke(channels.deleteModelGatewayMonitor, { id }),
    setMonitorEnabled: (id, enabled) =>
      ipcRenderer.invoke(channels.setModelGatewayMonitorEnabled, { id, enabled }),
    runMonitorNow: (id) => ipcRenderer.invoke(channels.runModelGatewayMonitorNow, { id }),
    exportReport: (input) => ipcRenderer.invoke(channels.exportModelGatewayReport, input),
  },
  shell: {
    revealSource: (path) => ipcRenderer.invoke(channels.revealSource, { path }),
  },
};

contextBridge.exposeInMainWorld("backplane", api);
