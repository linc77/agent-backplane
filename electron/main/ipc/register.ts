import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, ipcMain, session, shell } from "electron";
import electronUpdater from "electron-updater";
import type { ZodType } from "zod";
import { channels } from "../../shared/channels";
import {
  agentInputSchema,
  draftCorrectionFromContentSchema,
  draftCorrectionSchema,
  draftRevertSchema,
  memoryProfileInputSchema,
  profileIdInputSchema,
  revealSourceSchema,
  rootOverrideSchema,
  saveAgentProfileSchema,
  saveSkillManifestSchema,
  skillInputSchema,
  skillUsageInputSchema,
  sourceExcerptSchema,
  writeCorrectionSchema,
} from "../../shared/validation";
import { createAgentConfigService, defaultAgentConfigPaths } from "../services/agentConfig";
import {
  createAppUpdaterService,
  directUpdateFeedUrl,
  proxyConfigFromResolution,
  type AppUpdaterService,
} from "../services/appUpdater";
import { ElectronSecretStore } from "../services/electronSecretStore";
import { loadAgentMemorySnapshot, scanMemories } from "../services/memory";
import { draftCorrection, draftCorrectionFromContent, draftRevert, getSourceExcerpt, writeCorrection } from "../services/memory/correction";
import {
  cancelProfileGeneration,
  getProfileGeneration,
  startProfileGeneration,
} from "../services/memory/generation";
import { resolveAgentMemoryRoot, resolveMemoryRoot } from "../services/memory/paths";
import { loadMcpInventory } from "../services/mcp";
import { loadSkillInventory, saveSkillManifest } from "../services/skills";
import { loadSkillUsage } from "../services/skillUsage";
import { isTrustedRendererUrl } from "../windowPolicy";

const { autoUpdater } = electronUpdater;
let appUpdater: AppUpdaterService | undefined;

function getAppUpdater() {
  appUpdater ??= createAppUpdaterService({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    prepareNetwork: async () => {
      const proxy = await session.defaultSession.resolveProxy(directUpdateFeedUrl);
      await autoUpdater.netSession.setProxy(proxyConfigFromResolution(proxy));
      await autoUpdater.netSession.closeAllConnections();
    },
    updater: autoUpdater,
  });
  return appUpdater;
}

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  window: BrowserWindow,
  developmentOrigin?: string,
) {
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isTrustedRendererUrl(event.senderFrame.url, developmentOrigin)
  ) {
    throw new Error("Untrusted IPC sender");
  }
}

function handle<Input, Output>(
  channel: string,
  schema: ZodType<Input>,
  window: BrowserWindow,
  developmentOrigin: string | undefined,
  handler: (input: Input) => Output | Promise<Output>,
) {
  ipcMain.handle(channel, (event, input: unknown) => {
    assertTrustedSender(event, window, developmentOrigin);
    return handler(schema.parse(input));
  });
}

export function registerIpcHandlers(window: BrowserWindow, developmentOrigin?: string) {
  const agentConfig = createAgentConfigService(defaultAgentConfigPaths(), new ElectronSecretStore());
  ipcMain.handle(channels.getAppUpdateState, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return getAppUpdater().getState();
  });
  ipcMain.handle(channels.checkAppUpdate, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return getAppUpdater().checkForUpdates();
  });
  ipcMain.handle(channels.downloadAppUpdate, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return getAppUpdater().downloadUpdate();
  });
  ipcMain.handle(channels.installAppUpdate, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return getAppUpdater().installUpdate();
  });
  handle(channels.scanMemories, rootOverrideSchema, window, developmentOrigin, ({ rootOverride }) =>
    scanMemories(rootOverride));
  handle(channels.loadAgentMemorySnapshot, memoryProfileInputSchema, window, developmentOrigin, ({ agent, locale }) =>
    loadAgentMemorySnapshot(agent, locale));
  handle(channels.loadSkillInventory, skillInputSchema, window, developmentOrigin, ({ projectRootOverride }) =>
    loadSkillInventory(projectRootOverride));
  handle(channels.loadSkillUsage, skillUsageInputSchema, window, developmentOrigin, ({ targets }) =>
    loadSkillUsage(targets));
  handle(channels.saveSkillManifest, saveSkillManifestSchema, window, developmentOrigin, ({ input, projectRootOverride }) =>
    saveSkillManifest(input, projectRootOverride));
  handle(channels.loadMcpInventory, agentInputSchema, window, developmentOrigin, ({ agent }) =>
    loadMcpInventory(agent));
  handle(channels.startMemoryProfileGeneration, memoryProfileInputSchema, window, developmentOrigin, ({ agent, locale }) =>
    startProfileGeneration(agent, locale));
  ipcMain.handle(channels.getMemoryProfileGeneration, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return getProfileGeneration();
  });
  ipcMain.handle(channels.cancelMemoryProfileGeneration, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return cancelProfileGeneration();
  });
  handle(channels.getSourceExcerpt, sourceExcerptSchema, window, developmentOrigin, (input) =>
    getSourceExcerpt(resolveMemoryRoot(input.rootOverride), input.path, input.startLine, input.endLine));
  handle(channels.draftCorrection, draftCorrectionSchema, window, developmentOrigin, (input) =>
    draftCorrection(input.agent, resolveAgentMemoryRoot(input.agent, input.rootOverride), input.slug, input.bulletLines, input.targets));
  handle(channels.draftCorrectionFromContent, draftCorrectionFromContentSchema, window, developmentOrigin, (input) =>
    draftCorrectionFromContent(input.agent, resolveAgentMemoryRoot(input.agent, input.rootOverride), input.slug, input.content, input.targets));
  handle(channels.draftRevert, draftRevertSchema, window, developmentOrigin, (input) =>
    draftRevert(input.agent, resolveAgentMemoryRoot(input.agent, input.rootOverride), input.change, input.sourcePath));
  handle(channels.writeCorrection, writeCorrectionSchema, window, developmentOrigin, (input) =>
    writeCorrection(resolveAgentMemoryRoot(input.draft.agent, input.rootOverride), input.draft));
  ipcMain.handle(channels.loadAgentConfigInventory, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return agentConfig.load();
  });
  handle(channels.saveAgentProviderProfile, saveAgentProfileSchema, window, developmentOrigin, ({ input }) =>
    agentConfig.save(input));
  handle(channels.deleteAgentProviderProfile, profileIdInputSchema, window, developmentOrigin, ({ agent, profileId }) =>
    agentConfig.delete(agent, profileId));
  handle(channels.activateAgentProviderProfile, profileIdInputSchema, window, developmentOrigin, ({ agent, profileId }) =>
    agentConfig.activate(agent, profileId));
  handle(channels.revealSource, revealSourceSchema, window, developmentOrigin, async ({ path }) => {
    shell.showItemInFolder(path);
  });
}

export function removeIpcHandlers() {
  for (const channel of Object.values(channels)) {
    ipcMain.removeHandler(channel);
  }
}
