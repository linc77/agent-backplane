import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentKind, SaveAgentProfileInput } from "../../../src/lib/types";
import {
  createAgentConfigService,
  type AgentConfigPaths,
  type SecretStore,
} from "./agentConfig";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

class MemorySecrets implements SecretStore {
  values = new Map<string, string>();
  async get(id: string) { return this.values.get(id) ?? null; }
  async set(id: string, value: string) { this.values.set(id, value); }
  async delete(id: string) { this.values.delete(id); }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "amm-agent-config-"));
  roots.push(root);
  const home = join(root, "home");
  const paths: AgentConfigPaths = {
    home,
    catalog: join(home, ".agent-backplane", "agent-config-profiles.json"),
    backupRoot: join(home, ".agent-backplane", "backups", "agent-config"),
    codex: join(home, ".codex", "config.toml"),
    claude: join(home, ".claude", "settings.json"),
    hermes: join(home, ".hermes", "config.yaml"),
  };
  await Promise.all([paths.codex, paths.claude, paths.hermes].map((path) => mkdir(join(path, ".."), { recursive: true })));
  await writeFile(paths.codex, 'model = "gpt-test"\nmodel_provider = "openai"\n[features]\nmemories = true\n');
  await writeFile(paths.claude, JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: "old-secret", ANTHROPIC_MODEL: "claude-test" }, includeCoAuthoredBy: false }, null, 2));
  await writeFile(paths.hermes, "# keep me\nmodel:\n  provider: auto\n  default: hermes-test\nagent:\n  max_turns: 42\n");
  const secrets = new MemorySecrets();
  return { paths, secrets, service: createAgentConfigService(paths, secrets) };
}

function input(agent: AgentKind, protocol: SaveAgentProfileInput["protocol"]): SaveAgentProfileInput {
  return {
    id: null,
    agent,
    name: "Gateway",
    providerKey: "gateway",
    baseUrl: "https://gateway.example/v1",
    model: "test-model",
    protocol,
    official: false,
    apiKey: "managed-secret",
    clearSecret: false,
  };
}

describe("Agent configuration migration", () => {
  it("imports profile metadata without migrating native API keys", async () => {
    const { paths, service } = await fixture();
    const inventory = await service.load();
    expect(inventory.targets).toHaveLength(3);
    expect(inventory.targets.flatMap((target) => target.profiles).every((profile) => !profile.hasSecret)).toBe(true);
    expect(await readFile(paths.catalog, "utf8")).not.toContain("old-secret");
  });

  it("activates Codex and Claude profiles while preserving unrelated settings", async () => {
    const { paths, service } = await fixture();
    await service.load();
    let inventory = await service.save(input("codex", "responses"));
    const codex = inventory.targets.find((target) => target.agent === "codex")!.profiles.find((profile) => profile.name === "Gateway")!;
    await service.activate("codex", codex.id);
    const codexConfig = parseToml(await readFile(paths.codex, "utf8")) as Record<string, any>;
    expect(codexConfig.features.memories).toBe(true);
    expect(codexConfig.model_providers.gateway.experimental_bearer_token).toBe("managed-secret");

    inventory = await service.save(input("claudeCode", "anthropicMessages"));
    const claude = inventory.targets.find((target) => target.agent === "claudeCode")!.profiles.find((profile) => profile.name === "Gateway")!;
    const result = await service.activate("claudeCode", claude.id);
    const claudeConfig = JSON.parse(await readFile(paths.claude, "utf8"));
    expect(claudeConfig.includeCoAuthoredBy).toBe(false);
    expect(claudeConfig.env.ANTHROPIC_AUTH_TOKEN).toBe("managed-secret");
    expect(result.backupPath).not.toBeNull();
  });

  it("activates Hermes profiles and preserves unrelated YAML", async () => {
    const { paths, service } = await fixture();
    await service.load();
    const inventory = await service.save(input("hermes", "chatCompletions"));
    const hermes = inventory.targets.find((target) => target.agent === "hermes")!.profiles.find((profile) => profile.name === "Gateway")!;
    await service.activate("hermes", hermes.id);
    const text = await readFile(paths.hermes, "utf8");
    const root = parseYaml(text) as Record<string, any>;
    expect(text).toContain("# keep me");
    expect(root.agent.max_turns).toBe(42);
    expect(root.custom_providers[0].api_key).toBe("managed-secret");
  });
});
