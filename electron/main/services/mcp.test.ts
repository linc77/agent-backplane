import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadMcpInventoryFromPath,
  resolveMcpConfigPath,
  safeCommandLabel,
  safeOrigin,
} from "./mcp";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function root() {
  const value = await mkdtemp(join(tmpdir(), "backplane-mcp-"));
  roots.push(value);
  return value;
}

describe("MCP inventory", () => {
  it("redacts Codex arguments, environment values, and command-shaped secrets", async () => {
    const directory = await root();
    const path = join(directory, "config.toml");
    await writeFile(path, '[mcp_servers.context7]\ncommand = "/opt/homebrew/bin/npx --token top-secret"\nargs = ["secret-token"]\nenabled = false\n[mcp_servers.context7.env]\nAPI_KEY = "top-secret"\n');

    const inventory = await loadMcpInventoryFromPath("codex", path);

    expect(inventory.sources[0]).toMatchObject({ state: "loaded", serverCount: 1 });
    expect(inventory.servers[0]).toMatchObject({
      endpoint: "Local process",
      state: "disabled",
      transport: "stdio",
    });
    expect(JSON.stringify(inventory)).not.toMatch(/secret|API_KEY/);
    expect(safeCommandLabel("/opt/homebrew/bin/npx")).toBe("npx");
    expect(safeCommandLabel("env API_KEY=top-secret npx")).toBe("Local process");
  });

  it("loads trusted Codex project sources without letting one invalid source hide valid servers", async () => {
    const directory = await root();
    const validProject = join(directory, "valid-project");
    const invalidProject = join(directory, "invalid-project");
    await mkdir(join(validProject, ".codex"), { recursive: true });
    await mkdir(join(invalidProject, ".codex"), { recursive: true });
    await writeFile(join(validProject, ".codex", "config.toml"), '[mcp_servers.project-tool]\ncommand = "node"\n');
    await writeFile(join(invalidProject, ".codex", "config.toml"), "[[invalid");
    const path = join(directory, "config.toml");
    await writeFile(path, [
      '[mcp_servers.global-tool]',
      'url = "https://user:token@example.com/private"',
      `[projects.${JSON.stringify(validProject)}]`,
      'trust_level = "trusted"',
      `[projects.${JSON.stringify(invalidProject)}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"));

    const inventory = await loadMcpInventoryFromPath("codex", path);

    expect(inventory.servers.map((server) => server.name)).toEqual(["global-tool", "project-tool"]);
    expect(inventory.servers.find((server) => server.name === "project-tool")).toMatchObject({
      scope: "project",
      state: "configured",
    });
    expect(inventory.sources).toHaveLength(3);
    expect(inventory.sources.some((source) => source.state === "invalid" && source.diagnostic === "parse-failed")).toBe(true);
    expect(JSON.stringify(inventory)).not.toContain("token");
  });

  it("does not rediscover the user Codex config as the home project config", async () => {
    const directory = await root();
    const codexDirectory = join(directory, ".codex");
    await mkdir(codexDirectory);
    const path = join(codexDirectory, "config.toml");
    await writeFile(path, [
      '[mcp_servers.context7]',
      'command = "npx"',
      `[projects.${JSON.stringify(directory)}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"));

    const inventory = await loadMcpInventoryFromPath("codex", path);

    expect(inventory.sources).toHaveLength(1);
    expect(inventory.servers.map((server) => server.name)).toEqual(["context7"]);
  });

  it("models Claude local, project approval, WebSocket, and invalid remote configuration", async () => {
    const directory = await root();
    const project = join(directory, "demo");
    const brokenProject = join(directory, "broken");
    await mkdir(project);
    await mkdir(brokenProject);
    await writeFile(join(project, ".mcp.json"), JSON.stringify({
      mcpServers: {
        websocket: { type: "ws", url: "wss://user:token@example.com/private" },
        missingType: { url: "https://example.com/mcp" },
        rejected: { command: "node" },
        pending: { command: "node" },
      },
    }));
    await writeFile(join(brokenProject, ".mcp.json"), "{broken");
    const path = join(directory, ".claude.json");
    await writeFile(path, JSON.stringify({
      mcpServers: { user: { command: "/usr/bin/node", args: ["secret"] } },
      projects: {
        [project]: {
          mcpServers: { local: { command: "node" } },
          disabledMcpServers: ["local"],
          enabledMcpjsonServers: ["websocket"],
          disabledMcpjsonServers: ["rejected"],
        },
        [brokenProject]: {},
      },
    }));

    const inventory = await loadMcpInventoryFromPath("claudeCode", path);

    expect(inventory.servers.find((server) => server.name === "local")?.state).toBe("disabled");
    expect(inventory.servers.find((server) => server.name === "websocket")).toMatchObject({
      transport: "ws",
      endpoint: "wss://example.com",
      state: "configured",
    });
    expect(inventory.servers.find((server) => server.name === "missingType")).toMatchObject({
      state: "invalid",
      diagnostics: ["missing-transport"],
    });
    expect(inventory.servers.find((server) => server.name === "rejected")?.state).toBe("rejected");
    expect(inventory.servers.find((server) => server.name === "pending")?.state).toBe("pending");
    expect(inventory.sources.some((source) => source.path.endsWith("broken/.mcp.json") && source.state === "invalid")).toBe(true);
    expect(JSON.stringify(inventory)).not.toMatch(/token|private|secret/);
  });

  it("resolves Claude project MCP approval from user, project, and local settings", async () => {
    const directory = await root();
    const configDirectory = join(directory, "claude-config");
    const project = join(directory, "demo");
    const inheritedProject = join(directory, "inherited");
    await mkdir(configDirectory);
    await mkdir(join(project, ".claude"), { recursive: true });
    await mkdir(inheritedProject);
    await writeFile(join(configDirectory, "settings.json"), JSON.stringify({
      enableAllProjectMcpServers: true,
    }));
    await writeFile(join(project, ".claude", "settings.json"), JSON.stringify({
      enableAllProjectMcpServers: false,
      enabledMcpjsonServers: ["project-approved"],
    }));
    await writeFile(join(project, ".claude", "settings.local.json"), JSON.stringify({
      disabledMcpjsonServers: ["local-rejected"],
    }));
    await writeFile(join(project, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "project-approved": { command: "node" },
        "local-rejected": { command: "node" },
        pending: { command: "node" },
      },
    }));
    await writeFile(join(inheritedProject, ".mcp.json"), JSON.stringify({
      mcpServers: { "user-approved": { command: "node" } },
    }));
    const path = join(directory, ".claude.json");
    await writeFile(path, JSON.stringify({
      projects: {
        [project]: {},
        [inheritedProject]: {},
      },
    }));

    const inventory = await loadMcpInventoryFromPath("claudeCode", path, {
      claudeConfigDirectory: configDirectory,
    });

    expect(inventory.servers.find((server) => server.name === "project-approved")?.state).toBe("configured");
    expect(inventory.servers.find((server) => server.name === "local-rejected")?.state).toBe("rejected");
    expect(inventory.servers.find((server) => server.name === "pending")?.state).toBe("pending");
    expect(inventory.servers.find((server) => server.name === "user-approved")?.state).toBe("configured");
    expect(inventory.sources.map((source) => source.path)).toEqual(expect.arrayContaining([
      join(configDirectory, "settings.json"),
      join(project, ".claude", "settings.json"),
      join(project, ".claude", "settings.local.json"),
    ]));
  });

  it("reports missing primary configuration as a source state instead of an empty configured path", async () => {
    const directory = await root();
    const path = join(directory, "missing.yaml");

    const inventory = await loadMcpInventoryFromPath("hermes", path);

    expect(inventory.servers).toEqual([]);
    expect(inventory.sources).toEqual([
      expect.objectContaining({ path, state: "missing", diagnostic: null, serverCount: 0 }),
    ]);
  });

  it("normalizes Hermes boolean strings and diagnoses malformed entries", async () => {
    const directory = await root();
    const path = join(directory, "config.yaml");
    await writeFile(path, [
      "mcp_servers:",
      "  remote:",
      "    url: https://user:token@example.com/private",
      "    transport: sse",
      '    enabled: "false"',
      "  empty: {}",
      "  scalar: nope",
      "",
    ].join("\n"));

    const inventory = await loadMcpInventoryFromPath("hermes", path);

    expect(inventory.servers.find((server) => server.name === "remote")).toMatchObject({
      transport: "sse",
      state: "disabled",
      endpoint: "https://example.com",
    });
    expect(inventory.servers.find((server) => server.name === "empty")?.state).toBe("invalid");
    expect(inventory.servers.find((server) => server.name === "scalar")?.diagnostics).toEqual([
      "invalid-entry",
      "missing-endpoint",
    ]);
    expect(safeOrigin("file:///Users/demo/private?token=secret")).toBe("Remote endpoint");
  });

  it("resolves Agent config paths from their native environment directories", () => {
    const home = "/Users/demo";
    expect(resolveMcpConfigPath("codex", { CODEX_HOME: "~/codex-home" }, home)).toBe("/Users/demo/codex-home/config.toml");
    expect(resolveMcpConfigPath("claudeCode", { CLAUDE_CONFIG_DIR: "/tmp/claude-work" }, home)).toBe("/tmp/claude-work/.claude.json");
    expect(resolveMcpConfigPath("hermes", { HERMES_HOME: "/tmp/hermes-work" }, home)).toBe("/tmp/hermes-work/config.yaml");
  });
});
