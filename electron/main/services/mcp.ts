import { open as openFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, win32 } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import type {
  AgentKind,
  McpConfigSource,
  McpConfigSourceDiagnostic,
  McpEndpointKind,
  McpInventory,
  McpScope,
  McpServer,
  McpServerDiagnostic,
  McpServerState,
  McpTransport,
} from "../../../src/lib/types";
import { isoNow, sha256 } from "./shared";

type UnknownRecord = Record<string, unknown>;

const maxConfigBytes = 2_000_000;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringValue(value: unknown, key: string) {
  const candidate = record(value)?.[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function stringValues(value: unknown, key: string) {
  const candidate = record(value)?.[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}

function optionalStringValues(value: unknown, key: string) {
  const candidate = record(value)?.[key];
  return Array.isArray(candidate)
    ? new Set(candidate.filter((item): item is string => typeof item === "string"))
    : null;
}

function booleanValue(value: unknown, key: string) {
  const candidate = record(value)?.[key];
  if (typeof candidate === "boolean") return candidate;
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim().toLowerCase();
  return normalized === "true" ? true : normalized === "false" ? false : null;
}

function firstStringValues(values: unknown[], key: string) {
  for (const value of values) {
    const candidate = optionalStringValues(value, key);
    if (candidate) return candidate;
  }
  return new Set<string>();
}

function firstBooleanValue(values: unknown[], key: string) {
  for (const value of values) {
    const candidate = booleanValue(value, key);
    if (candidate !== null) return candidate;
  }
  return false;
}

function isEnabled(config: unknown) {
  return booleanValue(config, "enabled") ?? !(booleanValue(config, "disabled") ?? false);
}

function normalizeTransport(
  kind: string | null,
  command: string | null,
  url: string | null,
): McpTransport {
  switch (kind?.toLowerCase()) {
    case "stdio": return "stdio";
    case "sse": return "sse";
    case "ws":
    case "websocket": return "ws";
    case "http":
    case "streamable-http":
    case "streamable_http": return "http";
    default: return kind ? "unknown" : command ? "stdio" : url ? "http" : "unknown";
  }
}

function safeOriginDisplay(url: string): { label: string; kind: McpEndpointKind } {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
      return { label: "Remote endpoint", kind: "remote" };
    }
    return { label: `${parsed.protocol}//${parsed.host}`, kind: "value" };
  } catch {
    return { label: "Remote endpoint", kind: "remote" };
  }
}

export function safeOrigin(url: string) {
  return safeOriginDisplay(url).label;
}

function safeCommandDisplay(command: string): { label: string; kind: McpEndpointKind } {
  const trimmed = command.trim();
  if (!trimmed || /\s|["'`$]/u.test(trimmed)) return { label: "Local process", kind: "local" };
  const candidate = basename(win32.basename(trimmed));
  return /^[A-Za-z0-9._+-]{1,128}$/u.test(candidate)
    ? { label: candidate, kind: "value" }
    : { label: "Local process", kind: "local" };
}

export function safeCommandLabel(command: string) {
  return safeCommandDisplay(command).label;
}

function safeEndpoint(command: string | null, url: string | null): { label: string; kind: McpEndpointKind } {
  if (command && url) return { label: "Configured endpoint", kind: "conflicting" };
  if (command) return safeCommandDisplay(command);
  if (url) return safeOriginDisplay(url);
  return { label: "Not configured", kind: "missing" };
}

function serverId(agent: AgentKind, scope: string, name: string) {
  return sha256(`${agent}:${scope}:${name}`);
}

function sourceId(agent: AgentKind, path: string) {
  return sha256(`${agent}:source:${path}`);
}

function createSource(agent: AgentKind, path: string): McpConfigSource {
  return {
    id: sourceId(agent, path),
    path,
    label: basename(path) || path,
    state: "loaded",
    diagnostic: null,
    serverCount: 0,
  };
}

type TextReadResult =
  | { state: "loaded"; text: string }
  | { state: "missing" }
  | { state: "invalid"; diagnostic: McpConfigSourceDiagnostic };

async function readConfigText(path: string): Promise<TextReadResult> {
  let handle;
  try {
    handle = await openFile(path, "r");
    const details = await handle.stat();
    if (!details.isFile()) return { state: "invalid", diagnostic: "read-failed" };
    if (details.size > maxConfigBytes) return { state: "invalid", diagnostic: "file-too-large" };
    return { state: "loaded", text: await handle.readFile("utf8") };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR"
      ? { state: "missing" }
      : { state: "invalid", diagnostic: "read-failed" };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function loadRecordSource(
  agent: AgentKind,
  path: string,
  parser: (text: string) => unknown,
) {
  const source = createSource(agent, path);
  const read = await readConfigText(path);
  if (read.state !== "loaded") {
    source.state = read.state;
    source.diagnostic = read.state === "invalid" ? read.diagnostic : null;
    return { source, root: null as UnknownRecord | null };
  }
  let parsed: unknown;
  try {
    parsed = parser(read.text);
  } catch {
    source.state = "invalid";
    source.diagnostic = "parse-failed";
    return { source, root: null as UnknownRecord | null };
  }
  const root = parsed === null && !read.text.trim() ? {} : record(parsed);
  if (!root) {
    source.state = "invalid";
    source.diagnostic = "invalid-shape";
    return { source, root: null as UnknownRecord | null };
  }
  return { source, root };
}

function serverDiagnostics(
  agent: AgentKind,
  name: string,
  config: unknown,
  kind: string | null,
  command: string | null,
  url: string | null,
  transport: McpTransport,
) {
  const diagnostics = new Set<McpServerDiagnostic>();
  if (!record(config)) diagnostics.add("invalid-entry");
  if (!name.trim()) diagnostics.add("invalid-name");
  if (!command && !url) diagnostics.add("missing-endpoint");
  if (command && url) diagnostics.add("conflicting-endpoints");
  if (kind && transport === "unknown") diagnostics.add("unsupported-transport");
  if (agent === "claudeCode" && url && !kind) diagnostics.add("missing-transport");
  if (
    (transport === "stdio" && !command) ||
    (["http", "sse", "ws"] as McpTransport[]).includes(transport) && !url
  ) {
    diagnostics.add("transport-mismatch");
  }
  return [...diagnostics];
}

function appendServers({
  agent,
  value,
  scope,
  scopeLabel,
  idScope,
  source,
  output,
  transportKeys = ["type"],
  stateForName,
}: {
  agent: AgentKind;
  value: unknown;
  scope: McpScope;
  scopeLabel: string;
  idScope: string;
  source: McpConfigSource;
  output: McpServer[];
  transportKeys?: string[];
  stateForName?: (name: string) => Exclude<McpServerState, "configured" | "invalid"> | null;
}) {
  const servers = record(value);
  if (!servers) return;
  for (const [name, config] of Object.entries(servers)) {
    const command = stringValue(config, "command");
    const url = stringValue(config, "url");
    const kind = transportKeys.map((key) => stringValue(config, key)).find(Boolean) ?? null;
    const transport = normalizeTransport(kind, command, url);
    const diagnostics = serverDiagnostics(agent, name, config, kind, command, url, transport);
    const endpoint = safeEndpoint(command, url);
    const override = stateForName?.(name) ?? null;
    const state: McpServerState = diagnostics.length
      ? "invalid"
      : override ?? (isEnabled(config) ? "configured" : "disabled");
    output.push({
      id: serverId(agent, idScope, name),
      name,
      scope,
      scopeLabel,
      sourceId: source.id,
      sourcePath: source.path,
      transport,
      endpoint: endpoint.label,
      endpointKind: endpoint.kind,
      state,
      diagnostics,
    });
    source.serverCount += 1;
  }
}

async function parseCodex(path: string) {
  const primary = await loadRecordSource("codex", path, parseToml);
  const sources = [primary.source];
  const servers: McpServer[] = [];
  if (!primary.root) return { sources, servers };

  appendServers({
    agent: "codex",
    value: primary.root.mcp_servers,
    scope: "user",
    scopeLabel: "",
    idScope: "user",
    source: primary.source,
    output: servers,
  });

  const projects = Object.entries(record(primary.root.projects) ?? {})
    .filter(([, config]) => stringValue(config, "trust_level")?.toLowerCase() === "trusted");
  const projectResults = await Promise.all(projects.map(async ([projectPath]) => {
    const projectConfigPath = join(projectPath, ".codex", "config.toml");
    if (resolve(projectConfigPath) === resolve(path)) return null;
    const parsed = await loadRecordSource("codex", projectConfigPath, parseToml);
    if (parsed.source.state === "missing") return null;
    const projectServers: McpServer[] = [];
    if (parsed.root) {
      appendServers({
        agent: "codex",
        value: parsed.root.mcp_servers,
        scope: "project",
        scopeLabel: basename(projectPath) || "Project",
        idScope: `project:${projectConfigPath}`,
        source: parsed.source,
        output: projectServers,
      });
    }
    return { source: parsed.source, servers: projectServers };
  }));
  for (const result of projectResults) {
    if (!result) continue;
    sources.push(result.source);
    servers.push(...result.servers);
  }
  return { sources, servers };
}

function appendPresentSource(sources: McpConfigSource[], source: McpConfigSource) {
  if (source.state !== "missing") sources.push(source);
}

async function parseClaude(path: string, configDirectory: string) {
  const [primary, userSettings] = await Promise.all([
    loadRecordSource("claudeCode", path, JSON.parse),
    loadRecordSource("claudeCode", join(configDirectory, "settings.json"), JSON.parse),
  ]);
  const sources = [primary.source];
  appendPresentSource(sources, userSettings.source);
  const servers: McpServer[] = [];
  if (!primary.root) return { sources, servers };

  appendServers({
    agent: "claudeCode",
    value: primary.root.mcpServers,
    scope: "user",
    scopeLabel: "",
    idScope: "user",
    source: primary.source,
    output: servers,
  });

  const projects = Object.entries(record(primary.root.projects) ?? {});
  for (const [projectPath, projectValue] of projects) {
    const project = record(projectValue);
    const disabled = new Set(stringValues(project, "disabledMcpServers"));
    appendServers({
      agent: "claudeCode",
      value: project?.mcpServers,
      scope: "local",
      scopeLabel: basename(projectPath) || "Project",
      idScope: `local:${projectPath}`,
      source: primary.source,
      output: servers,
      stateForName: (name) => disabled.has(name) ? "disabled" : null,
    });
  }

  const sharedResults = await Promise.all(projects.map(async ([projectPath, projectValue]) => {
    const project = record(projectValue);
    const sharedPath = join(projectPath, ".mcp.json");
    const [parsed, projectSettings, localSettings] = await Promise.all([
      loadRecordSource("claudeCode", sharedPath, JSON.parse),
      loadRecordSource("claudeCode", join(projectPath, ".claude", "settings.json"), JSON.parse),
      loadRecordSource("claudeCode", join(projectPath, ".claude", "settings.local.json"), JSON.parse),
    ]);
    const relatedSources: McpConfigSource[] = [];
    appendPresentSource(relatedSources, parsed.source);
    appendPresentSource(relatedSources, projectSettings.source);
    appendPresentSource(relatedSources, localSettings.source);
    if (parsed.source.state === "missing") return null;
    const projectServers: McpServer[] = [];
    if (parsed.root) {
      const settings = [localSettings.root, projectSettings.root, userSettings.root, project];
      const approved = firstStringValues(settings, "enabledMcpjsonServers");
      const rejected = firstStringValues(settings, "disabledMcpjsonServers");
      const approveAll = firstBooleanValue(settings, "enableAllProjectMcpServers");
      appendServers({
        agent: "claudeCode",
        value: parsed.root.mcpServers,
        scope: "project",
        scopeLabel: basename(projectPath) || "Project",
        idScope: `project:${sharedPath}`,
        source: parsed.source,
        output: projectServers,
        stateForName: (name) => rejected.has(name)
          ? "rejected"
          : approveAll || approved.has(name)
            ? null
            : "pending",
      });
    }
    return { sources: relatedSources, servers: projectServers };
  }));
  for (const result of sharedResults) {
    if (!result) continue;
    sources.push(...result.sources);
    servers.push(...result.servers);
  }
  return { sources, servers };
}

async function parseHermes(path: string) {
  const primary = await loadRecordSource("hermes", path, parseYaml);
  const sources = [primary.source];
  const servers: McpServer[] = [];
  if (primary.root) {
    appendServers({
      agent: "hermes",
      value: primary.root.mcp_servers,
      scope: "user",
      scopeLabel: "",
      idScope: "user",
      source: primary.source,
      output: servers,
      transportKeys: ["transport", "type"],
    });
  }
  return { sources, servers };
}

export async function loadMcpInventoryFromPath(
  agent: AgentKind,
  path: string,
  options: { claudeConfigDirectory?: string } = {},
): Promise<McpInventory> {
  const parsed = agent === "codex"
    ? await parseCodex(path)
    : agent === "claudeCode"
      ? await parseClaude(path, options.claudeConfigDirectory ?? join(dirname(path), ".claude"))
      : await parseHermes(path);
  return {
    generatedAt: isoNow(),
    agent,
    sources: parsed.sources,
    servers: parsed.servers.sort((left, right) =>
      left.name.localeCompare(right.name) || left.scopeLabel.localeCompare(right.scopeLabel)),
  };
}

function environmentPath(value: string | undefined, home: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed === "~") return home;
  if (trimmed.startsWith("~/")) return join(home, trimmed.slice(2));
  return resolve(trimmed);
}

export function resolveMcpConfigPath(
  agent: AgentKind,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
) {
  if (agent === "codex") {
    return join(environmentPath(env.CODEX_HOME, home) ?? join(home, ".codex"), "config.toml");
  }
  if (agent === "claudeCode") {
    const configDirectory = environmentPath(env.CLAUDE_CONFIG_DIR, home);
    return configDirectory ? join(configDirectory, ".claude.json") : join(home, ".claude.json");
  }
  return join(environmentPath(env.HERMES_HOME, home) ?? join(home, ".hermes"), "config.yaml");
}

export function loadMcpInventory(agent: AgentKind) {
  const path = resolveMcpConfigPath(agent);
  const claudeConfigDirectory = agent === "claudeCode"
    ? environmentPath(process.env.CLAUDE_CONFIG_DIR, homedir()) ?? join(homedir(), ".claude")
    : undefined;
  return loadMcpInventoryFromPath(agent, path, { claudeConfigDirectory });
}
