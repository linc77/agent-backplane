import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, ipcMain, shell } from "electron";
import type { ZodType } from "zod";
import { channels } from "../../shared/channels";
import {
  agentInputSchema,
  auditInputSchema,
  draftCorrectionFromContentSchema,
  draftCorrectionSchema,
  profileIdInputSchema,
  revealSourceSchema,
  rootOverrideSchema,
  saveAgentProfileSchema,
  skillInputSchema,
  sourceExcerptSchema,
  writeCorrectionSchema,
} from "../../shared/validation";
import { createAgentConfigService, defaultAgentConfigPaths } from "../services/agentConfig";
import { cancelCodexAudit, getCodexAudit, runCodexAudit, startCodexAudit } from "../services/audit";
import { ElectronSecretStore } from "../services/electronSecretStore";
import { loadAgentMemorySnapshot, loadMemoryProfile, scanMemories } from "../services/memory";
import { draftCorrection, draftCorrectionFromContent, getSourceExcerpt, writeCorrection } from "../services/memory/correction";
import {
  cancelProfileGeneration,
  generateMemoryProfile,
  getProfileGeneration,
  startProfileGeneration,
} from "../services/memory/generation";
import { resolveMemoryRoot } from "../services/memory/paths";
import { loadMcpInventory } from "../services/mcp";
import { loadSkillInventory } from "../services/skills";
import { isTrustedRendererUrl } from "../windowPolicy";

const releasePage = "https://github.com/linc77/agent-memory-manager/releases";

function versionParts(value: string) {
  return value.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, current: string) {
  const left = versionParts(candidate);
  const right = versionParts(current);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) > (right[index] ?? 0);
  }
  return false;
}

async function checkAppUpdate() {
  const currentVersion = app.getVersion();
  const response = await fetch("https://api.github.com/repos/linc77/agent-memory-manager/releases/latest", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Agent-Memory-Manager" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub update check failed with status ${response.status}`);
  const release = await response.json() as { tag_name?: string; published_at?: string; body?: string };
  const version = release.tag_name?.replace(/^v/, "");
  if (!version || !isNewerVersion(version, currentVersion)) return null;
  return { currentVersion, version, date: release.published_at, body: release.body };
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
  ipcMain.handle(channels.appVersion, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return app.getVersion();
  });
  ipcMain.handle(channels.checkAppUpdate, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return checkAppUpdate();
  });
  ipcMain.handle(channels.openReleasePage, async (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    await shell.openExternal(releasePage);
  });
  handle(channels.scanMemories, rootOverrideSchema, window, developmentOrigin, ({ rootOverride }) =>
    scanMemories(rootOverride));
  handle(channels.loadMemoryProfile, rootOverrideSchema, window, developmentOrigin, ({ rootOverride }) =>
    loadMemoryProfile(rootOverride));
  handle(channels.loadAgentMemorySnapshot, agentInputSchema, window, developmentOrigin, ({ agent }) =>
    loadAgentMemorySnapshot(agent));
  handle(channels.loadSkillInventory, skillInputSchema, window, developmentOrigin, ({ projectRootOverride }) =>
    loadSkillInventory(projectRootOverride));
  handle(channels.loadMcpInventory, agentInputSchema, window, developmentOrigin, ({ agent }) =>
    loadMcpInventory(agent));
  handle(channels.generateMemoryProfile, rootOverrideSchema, window, developmentOrigin, ({ rootOverride }) =>
    generateMemoryProfile(rootOverride));
  handle(channels.startMemoryProfileGeneration, rootOverrideSchema, window, developmentOrigin, ({ rootOverride }) =>
    startProfileGeneration(rootOverride));
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
    draftCorrection(resolveMemoryRoot(input.rootOverride), input.slug, input.bulletLines));
  handle(channels.draftCorrectionFromContent, draftCorrectionFromContentSchema, window, developmentOrigin, (input) =>
    draftCorrectionFromContent(resolveMemoryRoot(input.rootOverride), input.slug, input.content));
  handle(channels.writeCorrection, writeCorrectionSchema, window, developmentOrigin, (input) =>
    writeCorrection(resolveMemoryRoot(input.rootOverride), input.draft));
  handle(channels.startCodexAudit, auditInputSchema, window, developmentOrigin, ({ rootOverride, mode }) =>
    startCodexAudit(rootOverride, mode));
  ipcMain.handle(channels.getCodexAudit, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return getCodexAudit();
  });
  ipcMain.handle(channels.cancelCodexAudit, (event) => {
    assertTrustedSender(event, window, developmentOrigin);
    return cancelCodexAudit();
  });
  handle(channels.runCodexAudit, auditInputSchema, window, developmentOrigin, ({ rootOverride, mode }) =>
    runCodexAudit(rootOverride, mode));
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
