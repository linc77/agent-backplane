import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parseDocument } from "yaml";
import type {
  AgentActivationResult,
  AgentConfigInventory,
  AgentKind,
  AgentProfileSource,
  AgentProtocol,
  AgentProviderProfile,
  AgentTarget,
  SaveAgentProfileInput,
} from "../../../src/lib/types";
import { atomicWrite, isoNow, nonBlankEnvironmentPath, sha256 } from "./shared";

type RecordValue = Record<string, unknown>;

interface StoredProfile {
  id: string;
  agent: AgentKind;
  name: string;
  providerKey: string;
  baseUrl: string;
  model: string;
  protocol: AgentProtocol;
  official: boolean;
  source: AgentProfileSource;
}

interface AgentCatalog {
  schemaVersion: 1;
  profiles: StoredProfile[];
  active: Partial<Record<AgentKind, string>>;
}

interface LiveConfig {
  providerKey: string;
  baseUrl: string;
  model: string;
  protocol: AgentProtocol;
  official: boolean;
}

export interface SecretStore {
  get(profileId: string): Promise<string | null>;
  set(profileId: string, secret: string): Promise<void>;
  delete(profileId: string): Promise<void>;
}

export interface AgentConfigPaths {
  home: string;
  catalog: string;
  backupRoot: string;
  codex: string;
  claude: string;
  hermes: string;
}

const agents: AgentKind[] = ["codex", "claudeCode", "hermes"];
const labels: Record<AgentKind, string> = { codex: "Codex", claudeCode: "Claude Code", hermes: "Hermes" };
const executables: Record<AgentKind, string> = { codex: "codex", claudeCode: "claude", hermes: "hermes" };
const reloadHints: Record<AgentKind, string> = {
  codex: "Restart Codex or open a new terminal session.",
  claudeCode: "Claude Code reloads settings automatically.",
  hermes: "Start a new Hermes session to use the profile.",
};
function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function string(value: unknown, fallback = "") {
  return typeof value === "string" && value.length ? value : fallback;
}

export function defaultAgentConfigPaths(home = homedir()): AgentConfigPaths {
  const appHome = join(home, ".agent-backplane");
  return {
    home,
    catalog: join(appHome, "agent-config-profiles.json"),
    backupRoot: join(appHome, "backups", "agent-config"),
    codex: join(nonBlankEnvironmentPath("CODEX_HOME") ?? join(home, ".codex"), "config.toml"),
    claude: join(nonBlankEnvironmentPath("CLAUDE_CONFIG_DIR") ?? join(home, ".claude"), "settings.json"),
    hermes: join(nonBlankEnvironmentPath("HERMES_HOME") ?? join(home, ".hermes"), "config.yaml"),
  };
}

function configPath(paths: AgentConfigPaths, agent: AgentKind) {
  return agent === "codex" ? paths.codex : agent === "claudeCode" ? paths.claude : paths.hermes;
}

async function readText(path: string) {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

async function loadCatalog(path: string): Promise<AgentCatalog> {
  const text = await readText(path);
  if (!text.trim()) return { schemaVersion: 1, profiles: [], active: {} };
  const raw = object(JSON.parse(text));
  if (raw.schemaVersion !== 1) throw new Error(`unsupported Agent profile catalog schema ${String(raw.schemaVersion)}`);
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).map((value): StoredProfile => {
    const item = object(value);
    return {
      id: string(item.id),
      agent: item.agent as AgentKind,
      name: string(item.name),
      providerKey: string(item.providerKey),
      baseUrl: string(item.baseUrl),
      model: string(item.model, "default"),
      protocol: item.protocol as AgentProtocol,
      official: item.official === true,
      source: item.source === "managed" ? "managed" : "imported",
    };
  }).filter((profile) => agents.includes(profile.agent) && profile.id);
  return { schemaVersion: 1, profiles, active: object(raw.active) as AgentCatalog["active"] };
}

function saveCatalog(path: string, catalog: AgentCatalog) {
  return atomicWrite(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

function normalizeProviderKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function providerKeyFromBaseUrl(value: string) {
  try {
    return normalizeProviderKey(new URL(value).hostname.split(".")[0] ?? "custom");
  } catch {
    return normalizeProviderKey(value.split(/[/.]/)[0] ?? "custom");
  }
}

function newProfileId(agent: AgentKind, seed: string) {
  return `${agent}-${createHash("sha256").update(`${agent}:${seed}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 12)}`;
}

function validateInput(input: SaveAgentProfileInput) {
  if (!input.name.trim()) throw new Error("profile name is required");
  if (!input.model.trim()) throw new Error("model is required");
  const provider = normalizeProviderKey(input.providerKey);
  if (!provider) throw new Error("provider key must contain letters, digits, or hyphens");
  if (!input.official) {
    if (!/^https?:\/\//.test(input.baseUrl.trim())) throw new Error("base URL must start with http:// or https://");
    if (input.agent === "codex" && ["openai", "ollama", "lmstudio"].includes(provider)) {
      throw new Error("Codex reserves the openai, ollama, and lmstudio provider keys");
    }
  }
  if (input.agent === "codex" && input.protocol !== "responses") throw new Error("Codex profiles must use the Responses protocol");
  if (input.agent === "claudeCode" && input.protocol !== "anthropicMessages") {
    throw new Error("Claude Code profiles must use the Anthropic Messages protocol");
  }
}

async function inspectClaude(path: string): Promise<LiveConfig> {
  const raw = await readText(path);
  const document = raw.trim() ? object(JSON.parse(raw)) : {};
  const env = object(document.env);
  const baseUrl = string(env.ANTHROPIC_BASE_URL);
  const model = string(env.ANTHROPIC_MODEL) || string(env.ANTHROPIC_DEFAULT_SONNET_MODEL) || string(env.ANTHROPIC_DEFAULT_OPUS_MODEL) || "default";
  const official = !baseUrl;
  return {
    providerKey: official ? "anthropic" : providerKeyFromBaseUrl(baseUrl),
    baseUrl: official ? "https://api.anthropic.com" : normalizeBaseUrl(baseUrl),
    model,
    protocol: "anthropicMessages",
    official,
  };
}

async function inspectCodex(path: string): Promise<LiveConfig> {
  const raw = await readText(path);
  const document = raw.trim() ? object(parseToml(raw)) : {};
  const providerKey = string(document.model_provider, "openai");
  const model = string(document.model, "default");
  const provider = object(object(document.model_providers)[providerKey]);
  return {
    providerKey,
    baseUrl: normalizeBaseUrl(string(provider.base_url, "https://chatgpt.com/codex")),
    model,
    protocol: "responses",
    official: providerKey === "openai",
  };
}

async function inspectHermes(path: string): Promise<LiveConfig> {
  const raw = await readText(path);
  const root = raw.trim() ? object(parseDocument(raw).toJS()) : {};
  const modelSection = object(root.model);
  const providerKey = string(modelSection.provider, "auto");
  const custom = (Array.isArray(root.custom_providers) ? root.custom_providers : [])
    .map(object)
    .find((provider) => string(provider.name) === providerKey);
  const baseUrl = string(modelSection.base_url) || string(custom?.base_url);
  const apiMode = string(custom?.api_mode, "chat_completions");
  const protocol: AgentProtocol = apiMode === "codex_responses"
    ? "responses" : apiMode === "anthropic_messages" ? "anthropicMessages" : "chatCompletions";
  return {
    providerKey,
    baseUrl: normalizeBaseUrl(baseUrl),
    model: string(modelSection.default, "default"),
    protocol,
    official: !custom,
  };
}

function inspectAgent(agent: AgentKind, path: string) {
  return agent === "codex" ? inspectCodex(path) : agent === "claudeCode" ? inspectClaude(path) : inspectHermes(path);
}

function matches(profile: StoredProfile, live: LiveConfig) {
  return profile.providerKey === live.providerKey &&
    normalizeBaseUrl(profile.baseUrl) === normalizeBaseUrl(live.baseUrl) &&
    profile.model === live.model;
}

async function buildClaudeConfig(path: string, profile: StoredProfile, secret: string | null) {
  const raw = await readText(path);
  const document = raw.trim() ? object(JSON.parse(raw)) : {};
  const env = object(document.env);
  for (const key of [
    "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
  ]) delete env[key];
  if (secret) env[profile.official ? "ANTHROPIC_API_KEY" : "ANTHROPIC_AUTH_TOKEN"] = secret;
  if (!profile.official) env.ANTHROPIC_BASE_URL = profile.baseUrl;
  if (profile.model !== "default") {
    for (const key of ["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL"]) {
      env[key] = profile.model;
    }
  }
  document.env = env;
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function buildCodexConfig(path: string, profile: StoredProfile, secret: string | null) {
  const raw = await readText(path);
  const document = raw.trim() ? object(parseToml(raw)) : {};
  document.model = profile.model;
  document.model_provider = profile.official ? "openai" : profile.providerKey;
  if (!profile.official) {
    const providers = object(document.model_providers);
    const provider = object(providers[profile.providerKey]);
    provider.name = profile.name;
    provider.base_url = profile.baseUrl;
    provider.wire_api = "responses";
    delete provider.experimental_bearer_token;
    delete provider.env_key;
    if (secret) provider.experimental_bearer_token = secret;
    providers[profile.providerKey] = provider;
    document.model_providers = providers;
  }
  return stringifyToml(document);
}

async function buildHermesConfig(path: string, profile: StoredProfile, secret: string | null) {
  const raw = await readText(path);
  const document = parseDocument(raw.trim() ? raw : "{}\n");
  document.setIn(["model", "provider"], profile.providerKey);
  document.setIn(["model", "default"], profile.model);
  if (profile.baseUrl) document.setIn(["model", "base_url"], profile.baseUrl);
  else document.deleteIn(["model", "base_url"]);
  if (!profile.official) {
    const root = object(document.toJS());
    const providers = (Array.isArray(root.custom_providers) ? root.custom_providers : []).map(object);
    const existing = providers.find((provider) => string(provider.name) === profile.providerKey) ?? {};
    existing.name = profile.providerKey;
    existing.base_url = profile.baseUrl;
    existing.model = profile.model;
    existing.api_mode = profile.protocol === "responses" ? "codex_responses" : profile.protocol === "anthropicMessages" ? "anthropic_messages" : "chat_completions";
    if (secret) existing.api_key = secret;
    else delete existing.api_key;
    if (!providers.includes(existing)) providers.push(existing);
    document.set("custom_providers", providers);
  }
  return document.toString();
}

function buildNativeConfig(agent: AgentKind, path: string, profile: StoredProfile, secret: string | null) {
  return agent === "codex" ? buildCodexConfig(path, profile, secret)
    : agent === "claudeCode" ? buildClaudeConfig(path, profile, secret)
      : buildHermesConfig(path, profile, secret);
}

async function createBackup(paths: AgentConfigPaths, agent: AgentKind, path: string) {
  const exists = await stat(path).then((value) => value.isFile()).catch(() => false);
  if (!exists) return null;
  const stamp = new Date().toISOString().replace(/[:TZ]/g, "-");
  const directory = join(paths.backupRoot, agent, stamp);
  await mkdir(directory, { recursive: true });
  const backup = join(directory, basename(path));
  await copyFile(path, backup);
  return backup;
}

async function findExecutable(name: string, home: string) {
  const directories = [...new Set([
    ...(process.env.PATH?.split(delimiter) ?? []),
    "/opt/homebrew/bin", "/usr/local/bin", join(home, ".local", "bin"), join(home, ".cargo", "bin"),
  ])];
  for (const directory of directories) {
    const path = join(directory, process.platform === "win32" ? `${name}.exe` : name);
    if (await access(path, constants.X_OK).then(() => true).catch(() => false)) return path;
  }
  return null;
}

async function buildInventory(paths: AgentConfigPaths, catalog: AgentCatalog, secrets: SecretStore): Promise<AgentConfigInventory> {
  const targets: AgentTarget[] = [];
  for (const agent of agents) {
    const path = configPath(paths, agent);
    const live = await inspectAgent(agent, path);
    const activeProfileId = catalog.profiles.find((profile) => profile.agent === agent && matches(profile, live))?.id ?? null;
    const profiles: AgentProviderProfile[] = [];
    for (const profile of catalog.profiles.filter((item) => item.agent === agent)) {
      profiles.push({ ...profile, hasSecret: Boolean(await secrets.get(profile.id)), active: profile.id === activeProfileId });
    }
    profiles.sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));
    const executablePath = await findExecutable(executables[agent], paths.home);
    const configExists = await stat(path).then((value) => value.isFile()).catch(() => false);
    targets.push({
      agent,
      label: labels[agent],
      installed: Boolean(executablePath) || configExists,
      executablePath,
      configPath: path,
      configExists,
      activeProfileId,
      activeProviderKey: live.providerKey,
      activeModel: live.model,
      activeBaseUrl: live.baseUrl,
      reloadHint: reloadHints[agent],
      profiles,
    });
  }
  return { generatedAt: isoNow(), catalogPath: paths.catalog, targets };
}

export function createAgentConfigService(paths: AgentConfigPaths, secrets: SecretStore) {
  let queue = Promise.resolve<unknown>(undefined);
  const serialized = <T>(operation: () => Promise<T>) => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };

  const load = () => serialized(async () => {
    const catalog = await loadCatalog(paths.catalog);
    let changed = false;
    for (const agent of agents) {
      if (catalog.profiles.some((profile) => profile.agent === agent)) continue;
      const live = await inspectAgent(agent, configPath(paths, agent));
      const id = newProfileId(agent, "current-local-config");
      catalog.profiles.push({ id, agent, name: "Current local config", ...live, source: "imported" });
      catalog.active[agent] = id;
      changed = true;
    }
    if (changed) await saveCatalog(paths.catalog, catalog);
    return buildInventory(paths, catalog, secrets);
  });

  const save = (input: SaveAgentProfileInput) => serialized(async () => {
    validateInput(input);
    const catalog = await loadCatalog(paths.catalog);
    const id = input.id?.trim() || newProfileId(input.agent, input.providerKey);
    const previous = catalog.profiles.find((profile) => profile.id === id);
    if (previous && previous.agent !== input.agent) throw new Error("profile Agent cannot be changed");
    const stored: StoredProfile = {
      id,
      agent: input.agent,
      name: input.name.trim(),
      providerKey: normalizeProviderKey(input.providerKey),
      baseUrl: normalizeBaseUrl(input.baseUrl),
      model: input.model.trim(),
      protocol: input.protocol,
      official: input.official,
      source: "managed",
    };
    const index = catalog.profiles.findIndex((profile) => profile.id === id);
    if (index >= 0) catalog.profiles[index] = stored;
    else catalog.profiles.push(stored);
    if (input.clearSecret) await secrets.delete(id);
    else if (input.apiKey?.trim()) await secrets.set(id, input.apiKey.trim());
    await saveCatalog(paths.catalog, catalog);
    return buildInventory(paths, catalog, secrets);
  });

  const remove = (agent: AgentKind, profileId: string) => serialized(async () => {
    const catalog = await loadCatalog(paths.catalog);
    const profile = catalog.profiles.find((item) => item.id === profileId && item.agent === agent);
    if (!profile) throw new Error("Agent provider profile was not found");
    const live = await inspectAgent(agent, configPath(paths, agent));
    if (matches(profile, live)) throw new Error("activate another profile before deleting the current profile");
    catalog.profiles = catalog.profiles.filter((item) => item.id !== profileId);
    if (catalog.active[agent] === profileId) delete catalog.active[agent];
    await secrets.delete(profileId);
    await saveCatalog(paths.catalog, catalog);
    return buildInventory(paths, catalog, secrets);
  });

  const activate = (agent: AgentKind, profileId: string) => serialized(async (): Promise<AgentActivationResult> => {
    const catalog = await loadCatalog(paths.catalog);
    const profile = catalog.profiles.find((item) => item.id === profileId && item.agent === agent);
    if (!profile) throw new Error("Agent provider profile was not found");
    const path = configPath(paths, agent);
    const output = await buildNativeConfig(agent, path, profile, await secrets.get(profileId));
    const backupPath = await createBackup(paths, agent, path);
    await atomicWrite(path, output);
    catalog.active[agent] = profileId;
    await saveCatalog(paths.catalog, catalog);
    return { inventory: await buildInventory(paths, catalog, secrets), backupPath, reloadHint: reloadHints[agent] };
  });

  return { load, save, delete: remove, activate };
}

export const agentConfigInternals = {
  buildCodexConfig,
  buildClaudeConfig,
  buildHermesConfig,
  inspectAgent,
  normalizeProviderKey,
  sha256,
};
