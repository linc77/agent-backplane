import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SecretStore } from "./agentConfig";
import { ModelGatewayProviderService } from "./modelGatewayProviders";

const roots: string[] = [];

class MemorySecrets implements SecretStore {
  values = new Map<string, string>();
  async get(id: string) { return this.values.get(id) ?? null; }
  async set(id: string, value: string) { this.values.set(id, value); }
  async delete(id: string) { this.values.delete(id); }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ModelGatewayProviderService", () => {
  it("persists multiple provider URLs while keeping keys out of the catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "gateway-providers-"));
    roots.push(root);
    const catalog = join(root, "providers.json");
    const secrets = new MemorySecrets();
    const service = new ModelGatewayProviderService(catalog, secrets);

    await service.save({
      id: null,
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1/",
      apiKey: "openai-secret",
      clearSecret: false,
    });
    const inventory = await service.save({
      id: null,
      name: "Anthropic gateway",
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "anthropic-secret",
      clearSecret: false,
    });

    expect(inventory.providers).toHaveLength(2);
    expect(inventory.providers.every((provider) => provider.hasSecret)).toBe(true);
    const content = await readFile(catalog, "utf8");
    expect(content).not.toContain("openai-secret");
    expect(content).not.toContain("anthropic-secret");

    const resolved = await service.resolve(inventory.providers[0].id);
    expect(resolved).toMatchObject({ baseUrl: "https://api.openai.com/v1", apiKey: "openai-secret" });
  });

  it("updates metadata without requiring the saved key to be entered again", async () => {
    const root = await mkdtemp(join(tmpdir(), "gateway-providers-"));
    roots.push(root);
    const service = new ModelGatewayProviderService(join(root, "providers.json"), new MemorySecrets());
    const created = await service.save({
      id: null,
      name: "Primary",
      baseUrl: "https://gateway.example.com/v1",
      apiKey: "secret",
      clearSecret: false,
    });
    const provider = created.providers[0];

    const updated = await service.save({
      id: provider.id,
      name: "Primary updated",
      baseUrl: "https://gateway.example.com/openai/v1",
      apiKey: null,
      clearSecret: false,
    });

    expect(updated.providers[0]).toMatchObject({ name: "Primary updated", hasSecret: true });
    expect((await service.resolve(provider.id)).apiKey).toBe("secret");
  });
});
