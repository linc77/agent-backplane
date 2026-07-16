import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMcpInventoryFromPath, safeOrigin } from "./mcp";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function root() {
  const value = await mkdtemp(join(tmpdir(), "amm-mcp-"));
  roots.push(value);
  return value;
}

describe("MCP inventory parity", () => {
  it("redacts Codex args and environment values", async () => {
    const directory = await root();
    const path = join(directory, "config.toml");
    await writeFile(path, '[mcp_servers.context7]\ncommand = "/opt/homebrew/bin/npx"\nargs = ["secret-token"]\nenabled = false\n[mcp_servers.context7.env]\nAPI_KEY = "top-secret"\n');
    const inventory = await loadMcpInventoryFromPath("codex", path);
    expect(inventory.servers[0]).toMatchObject({ endpoint: "npx", enabled: false, transport: "stdio" });
    expect(JSON.stringify(inventory)).not.toMatch(/secret|API_KEY/);
  });

  it("reads Claude project declarations and redacts remote URLs", async () => {
    const directory = await root();
    const project = join(directory, "demo");
    await mkdir(project);
    await writeFile(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { shared: { command: "node", args: ["secret"] } } }));
    const path = join(directory, ".claude.json");
    await writeFile(path, JSON.stringify({
      mcpServers: { global: { command: "/usr/bin/node", args: ["secret"] } },
      projects: { [project]: { mcpServers: { remote: { type: "http", url: "https://user:token@example.com/private?key=secret" } } } },
    }));
    const inventory = await loadMcpInventoryFromPath("claudeCode", path);
    expect(inventory.servers).toHaveLength(3);
    expect(inventory.servers.some((server) => server.endpoint === "https://example.com")).toBe(true);
    expect(JSON.stringify(inventory)).not.toMatch(/token|private|secret/);
  });

  it("normalizes Hermes transport and safe origins", async () => {
    const directory = await root();
    const path = join(directory, "config.yaml");
    await writeFile(path, "mcp_servers:\n  remote:\n    url: https://user:token@example.com/private\n    transport: sse\n    enabled: false\n");
    const inventory = await loadMcpInventoryFromPath("hermes", path);
    expect(inventory.servers[0]).toMatchObject({ transport: "sse", enabled: false, endpoint: "https://example.com" });
    expect(safeOrigin("https://user:token@example.com?api_key=secret")).toBe("https://example.com");
  });
});
