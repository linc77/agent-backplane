import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import type { AgentKind, McpInventory, McpScope, McpServer, McpTransport } from "../../../src/lib/types";
import { isoNow, nonBlankEnvironmentPath, sha256 } from "./shared";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringValue(value: unknown, key: string) {
  const candidate = record(value)?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function booleanValue(value: unknown, key: string) {
  const candidate = record(value)?.[key];
  return typeof candidate === "boolean" ? candidate : null;
}

function enabled(config: unknown) {
  return booleanValue(config, "enabled") ?? !(booleanValue(config, "disabled") ?? false);
}

function transport(kind: string | null, command: string | null, url: string | null): McpTransport {
  switch (kind?.toLowerCase()) {
    case "stdio": return "stdio";
    case "sse": return "sse";
    case "http":
    case "streamable-http": return "http";
    default: return command ? "stdio" : url ? "http" : "unknown";
  }
}

export function safeOrigin(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "Remote endpoint";
  }
}

function safeEndpoint(command: string | null, url: string | null) {
  if (command?.trim()) return basename(command) || "local command";
  if (url?.trim()) return safeOrigin(url);
  return "Configured endpoint";
}

function serverId(agent: AgentKind, scope: string, name: string) {
  return sha256(`${agent}:${scope}:${name}`);
}

function appendServers(
  agent: AgentKind,
  value: unknown,
  scope: McpScope,
  scopeLabel: string,
  idScope: string,
  output: McpServer[],
) {
  const servers = record(value);
  if (!servers) return;
  for (const [name, config] of Object.entries(servers)) {
    const command = stringValue(config, "command");
    const url = stringValue(config, "url");
    output.push({
      id: serverId(agent, idScope, name),
      name,
      scope,
      scopeLabel,
      transport: transport(stringValue(config, "type"), command, url),
      endpoint: safeEndpoint(command, url),
      enabled: enabled(config),
    });
  }
}

async function parseCodex(path: string) {
  let root: UnknownRecord;
  try {
    root = record(parseToml(await readFile(path, "utf8"))) ?? {};
  } catch {
    throw new Error("failed to parse Codex MCP config");
  }
  const output: McpServer[] = [];
  appendServers("codex", root.mcp_servers, "global", "Global", "global", output);
  return { servers: output, paths: [] as string[] };
}

async function parseClaude(path: string) {
  let root: UnknownRecord;
  try {
    root = record(JSON.parse(await readFile(path, "utf8"))) ?? {};
  } catch {
    throw new Error("failed to parse Claude Code MCP config");
  }
  const output: McpServer[] = [];
  const paths: string[] = [];
  appendServers("claudeCode", root.mcpServers, "global", "Global", "user", output);
  for (const [projectPath, project] of Object.entries(record(root.projects) ?? {})) {
    const label = basename(projectPath) || "Project";
    appendServers("claudeCode", record(project)?.mcpServers, "project", label, `local:${projectPath}`, output);
    const sharedPath = join(projectPath, ".mcp.json");
    const sharedExists = await stat(sharedPath).then((value) => value.isFile()).catch(() => false);
    if (!sharedExists) continue;
    let shared: UnknownRecord;
    try {
      shared = record(JSON.parse(await readFile(sharedPath, "utf8"))) ?? {};
    } catch {
      throw new Error(`failed to parse Claude Code project MCP config ${sharedPath}`);
    }
    appendServers("claudeCode", shared.mcpServers, "project", `${label} · shared`, `project:${sharedPath}`, output);
    paths.push(sharedPath);
  }
  return { servers: output, paths };
}

async function parseHermes(path: string) {
  let root: UnknownRecord;
  try {
    root = record(parseYaml(await readFile(path, "utf8"))) ?? {};
  } catch {
    throw new Error("failed to parse Hermes MCP config");
  }
  const servers = record(root.mcp_servers);
  const output: McpServer[] = [];
  if (servers) {
    for (const [name, config] of Object.entries(servers)) {
      const command = stringValue(config, "command");
      const url = stringValue(config, "url");
      output.push({
        id: serverId("hermes", "global", name),
        name,
        scope: "global",
        scopeLabel: "Global",
        transport: transport(stringValue(config, "transport") ?? stringValue(config, "type"), command, url),
        endpoint: safeEndpoint(command, url),
        enabled: enabled(config),
      });
    }
  }
  return { servers: output, paths: [] as string[] };
}

export async function loadMcpInventoryFromPath(agent: AgentKind, path: string): Promise<McpInventory> {
  const exists = await stat(path).then((value) => value.isFile()).catch(() => false);
  const parsed = !exists
    ? { servers: [] as McpServer[], paths: [] as string[] }
    : agent === "codex" ? await parseCodex(path)
      : agent === "claudeCode" ? await parseClaude(path)
        : await parseHermes(path);
  return {
    generatedAt: isoNow(),
    agent,
    configPaths: [path, ...parsed.paths],
    servers: parsed.servers.sort((left, right) => left.name.localeCompare(right.name) || left.scopeLabel.localeCompare(right.scopeLabel)),
  };
}

export function loadMcpInventory(agent: AgentKind) {
  const home = homedir();
  const path = agent === "codex"
    ? join(nonBlankEnvironmentPath("CODEX_HOME") ?? join(home, ".codex"), "config.toml")
    : agent === "claudeCode"
      ? join(home, ".claude.json")
      : join(nonBlankEnvironmentPath("HERMES_HOME") ?? join(home, ".hermes"), "config.yaml");
  return loadMcpInventoryFromPath(agent, path);
}
