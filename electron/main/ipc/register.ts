import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, dialog, ipcMain, Notification, session, shell } from "electron";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import electronUpdater from "electron-updater";
import type { ZodType } from "zod";
import { channels } from "../../shared/channels";
import {
  agentInputSchema,
  applySkillProfileSchema,
  deleteSkillProfileSchema,
  draftCorrectionFromContentSchema,
  draftCorrectionSchema,
  draftRevertSchema,
  emptyInputSchema,
  exportModelGatewayReportSchema,
  memoryProfileInputSchema,
  modelGatewayBenchmarkSchema,
  modelGatewayCredentialsSchema,
  modelGatewayMonitorEnabledSchema,
  modelGatewayMonitorIdSchema,
  modelGatewayProviderIdSchema,
  modelGatewayProbeSchema,
  saveModelGatewayProviderSchema,
  saveModelGatewayMonitorSchema,
  startModelGatewayTestSchema,
  profileIdInputSchema,
  revealSourceSchema,
  rootOverrideSchema,
  projectSkillBindingSchema,
  saveProjectSkillSelectionSchema,
  saveSkillProfileSchema,
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
import { benchmarkModelGateway, discoverModelGateway } from "../services/modelGateway";
import {
  defaultModelGatewayMonitoringPaths,
  ModelGatewayMonitoringService,
} from "../services/modelGatewayMonitoring";
import { probeModelGateway } from "../services/modelGatewayProbe";
import {
  defaultModelGatewayProviderPaths,
  ModelGatewayProviderService,
} from "../services/modelGatewayProviders";
import { renderModelGatewayReport } from "../services/modelGatewayReport";
import { ModelGatewayStore } from "../services/modelGatewayStore";
import { ModelGatewayTestManager } from "../services/modelGatewayTest";
import { atomicWrite } from "../services/shared";
import { loadSkillInventory, saveSkillManifest } from "../services/skills";
import { createSkillProfileService } from "../services/skillProfiles";
import { loadSkillUsage } from "../services/skillUsage";
import { isTrustedRendererUrl } from "../windowPolicy";

const { autoUpdater } = electronUpdater;
let appUpdater: AppUpdaterService | undefined;
let modelGatewayMonitoring: ModelGatewayMonitoringService | undefined;
let modelGatewayTests: ModelGatewayTestManager | undefined;
let modelGatewayStore: ModelGatewayStore | undefined;
let modelGatewayProviders: ModelGatewayProviderService | undefined;

function getModelGatewayServices() {
  if (!modelGatewayMonitoring || !modelGatewayTests) {
    const paths = defaultModelGatewayMonitoringPaths();
    const providerPaths = defaultModelGatewayProviderPaths();
    const store = new ModelGatewayStore(paths.database);
    modelGatewayStore = store;
    const providers = new ModelGatewayProviderService(
      providerPaths.catalog,
      new ElectronSecretStore(providerPaths.secrets),
    );
    modelGatewayProviders = providers;
    modelGatewayMonitoring = new ModelGatewayMonitoringService({
      paths,
      providers,
      store,
      notify: (title, body) => {
        if (Notification.isSupported()) new Notification({ title, body }).show();
      },
    });
    modelGatewayTests = new ModelGatewayTestManager({
      onSample: (runId, sample) => store.insertSample({ runId }, sample),
    });
    void modelGatewayMonitoring.start();
  }
  return {
    monitoring: modelGatewayMonitoring!,
    providers: modelGatewayProviders!,
    tests: modelGatewayTests!,
    store: modelGatewayStore!,
  };
}

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
  const skillProfiles = createSkillProfileService({
    catalogPath: join(homedir(), ".agent-backplane", "skill-profiles.json"),
  });
  const gatewayServices = getModelGatewayServices();
  const resolveGatewayCredentials = async <T extends { providerId?: string | null; baseUrl: string; apiKey: string }>(input: T) => {
    if (!input.providerId) return input;
    const credentials = await gatewayServices.providers.resolve(input.providerId);
    return { ...input, ...credentials };
  };
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
  handle(channels.loadSkillWorkspace, emptyInputSchema, window, developmentOrigin, () =>
    skillProfiles.load());
  handle(channels.chooseSkillProject, emptyInputSchema, window, developmentOrigin, async () => {
    const selection = await dialog.showOpenDialog(window, {
      title: "Choose a project folder",
      properties: ["openDirectory"],
    });
    const selectedPath = selection.filePaths[0];
    if (selection.canceled || !selectedPath) return null;
    const canonicalPath = await realpath(selectedPath);
    const workspace = await skillProfiles.registerProject(canonicalPath);
    return workspace.projects.find((project) => project.rootPath === canonicalPath) ?? null;
  });
  handle(channels.saveProjectSkillSelection, saveProjectSkillSelectionSchema, window, developmentOrigin, (input) =>
    skillProfiles.saveSelection(input));
  handle(channels.saveSkillProfile, saveSkillProfileSchema, window, developmentOrigin, (input) =>
    skillProfiles.saveProfile(input));
  handle(channels.deleteSkillProfile, deleteSkillProfileSchema, window, developmentOrigin, ({ profileId }) =>
    skillProfiles.deleteProfile(profileId));
  handle(channels.applySkillProfile, applySkillProfileSchema, window, developmentOrigin, (input) =>
    skillProfiles.applyProfile(input));
  handle(channels.syncProjectSkills, projectSkillBindingSchema, window, developmentOrigin, (input) =>
    skillProfiles.sync(input));
  handle(channels.loadMcpInventory, agentInputSchema, window, developmentOrigin, ({ agent }) =>
    loadMcpInventory(agent));
  ipcMain.handle(channels.loadModelGatewayProviders, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return gatewayServices.providers.inventory();
  });
  handle(channels.saveModelGatewayProvider, saveModelGatewayProviderSchema, window, developmentOrigin, (input) =>
    gatewayServices.providers.save(input));
  handle(channels.deleteModelGatewayProvider, modelGatewayProviderIdSchema, window, developmentOrigin, async ({ id }) => {
    const monitors = await gatewayServices.monitoring.inventory();
    if (monitors.monitors.some((monitor) => monitor.providerId === id)) {
      throw new Error("Delete Monitors that use this provider first.");
    }
    return gatewayServices.providers.delete(id);
  });
  handle(channels.discoverModelGateway, modelGatewayCredentialsSchema, window, developmentOrigin, async (input) =>
    discoverModelGateway(await resolveGatewayCredentials(input)));
  handle(channels.benchmarkModelGateway, modelGatewayBenchmarkSchema, window, developmentOrigin, async (input) =>
    benchmarkModelGateway(await resolveGatewayCredentials(input)));
  handle(channels.probeModelGateway, modelGatewayProbeSchema, window, developmentOrigin, async (input) =>
    probeModelGateway(await resolveGatewayCredentials(input)));
  handle(channels.startModelGatewayTest, startModelGatewayTestSchema, window, developmentOrigin, async (input) =>
    gatewayServices.tests.start(await resolveGatewayCredentials(input)));
  ipcMain.handle(channels.getModelGatewayTest, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return gatewayServices.tests.get();
  });
  ipcMain.handle(channels.cancelModelGatewayTest, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return gatewayServices.tests.cancel();
  });
  ipcMain.handle(channels.loadModelGatewayMonitors, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return gatewayServices.monitoring.inventory();
  });
  handle(channels.saveModelGatewayMonitor, saveModelGatewayMonitorSchema, window, developmentOrigin, (input) =>
    gatewayServices.monitoring.save(input));
  handle(channels.deleteModelGatewayMonitor, modelGatewayMonitorIdSchema, window, developmentOrigin, ({ id }) =>
    gatewayServices.monitoring.delete(id));
  handle(channels.setModelGatewayMonitorEnabled, modelGatewayMonitorEnabledSchema, window, developmentOrigin, ({ id, enabled }) =>
    gatewayServices.monitoring.setEnabled(id, enabled));
  handle(channels.runModelGatewayMonitorNow, modelGatewayMonitorIdSchema, window, developmentOrigin, ({ id }) =>
    gatewayServices.monitoring.runNow(id));
  handle(channels.exportModelGatewayReport, exportModelGatewayReportSchema, window, developmentOrigin, async (input) => {
    const selection = await dialog.showSaveDialog(window, {
      defaultPath: `model-gateway-${input.scope}-${input.id.slice(0, 8)}.${input.format}`,
      filters: [{ name: input.format.toUpperCase(), extensions: [input.format] }],
    });
    if (selection.canceled || !selection.filePath) return null;
    const samples = input.scope === "test"
      ? gatewayServices.store.samplesForRun(input.id)
      : gatewayServices.store.samplesForMonitor(
        input.id,
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
        100_000,
        null,
      );
    await atomicWrite(selection.filePath, renderModelGatewayReport(input, samples));
    return { path: selection.filePath, format: input.format };
  });
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
