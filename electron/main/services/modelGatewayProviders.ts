import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ModelGatewayCredentials,
  ModelGatewayProvider,
  ModelGatewayProviderInventory,
  SaveModelGatewayProviderInput,
} from "../../../src/lib/types";
import type { SecretStore } from "./agentConfig";
import { normalizeModelGatewayBaseUrl } from "./modelGateway";
import { atomicWrite } from "./shared";

type StoredProvider = Omit<ModelGatewayProvider, "hasSecret">;

interface ProviderCatalog {
  schemaVersion: 1;
  providers: StoredProvider[];
}

export interface ModelGatewayProviderPaths {
  catalog: string;
  secrets: string;
}

export function defaultModelGatewayProviderPaths(home = homedir()): ModelGatewayProviderPaths {
  const root = join(home, ".agent-backplane");
  return {
    catalog: join(root, "model-gateway-providers.json"),
    secrets: join(root, "model-gateway-provider-secrets.json"),
  };
}

function secretId(providerId: string) {
  return `model-gateway-provider:${providerId}`;
}

export class ModelGatewayProviderService {
  private catalog: ProviderCatalog | null = null;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly catalogPath: string,
    private readonly secretStore: SecretStore,
  ) {}

  async inventory(): Promise<ModelGatewayProviderInventory> {
    const catalog = await this.load();
    const providers = await Promise.all(catalog.providers.map(async (provider) => ({
      ...structuredClone(provider),
      hasSecret: Boolean(await this.secretStore.get(secretId(provider.id))),
    })));
    return { generatedAt: new Date().toISOString(), providers };
  }

  async save(input: SaveModelGatewayProviderInput) {
    const catalog = await this.load();
    const name = input.name.trim();
    if (!name) throw new Error("Provider name is required.");
    const baseUrl = normalizeModelGatewayBaseUrl(input.baseUrl);
    const id = input.id ?? randomUUID();
    const existing = catalog.providers.find((provider) => provider.id === id);
    const now = new Date().toISOString();

    if (input.apiKey?.trim()) {
      await this.secretStore.set(secretId(id), input.apiKey.trim());
    } else if (input.clearSecret) {
      await this.secretStore.delete(secretId(id));
    }
    const hasSecret = Boolean(await this.secretStore.get(secretId(id)));
    if (!hasSecret) throw new Error("A saved provider requires an API key.");

    const provider: StoredProvider = {
      id,
      name,
      baseUrl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const index = catalog.providers.findIndex((item) => item.id === id);
    if (index >= 0) catalog.providers[index] = provider;
    else catalog.providers.push(provider);
    await this.persist();
    return this.inventory();
  }

  async resolve(providerId: string): Promise<ModelGatewayCredentials> {
    const catalog = await this.load();
    const provider = catalog.providers.find((item) => item.id === providerId);
    if (!provider) throw new Error("Model gateway provider not found.");
    const apiKey = await this.secretStore.get(secretId(providerId));
    if (!apiKey) throw new Error("Model gateway provider credentials are unavailable.");
    return { providerId, baseUrl: provider.baseUrl, apiKey };
  }

  async delete(providerId: string) {
    const catalog = await this.load();
    catalog.providers = catalog.providers.filter((provider) => provider.id !== providerId);
    await this.secretStore.delete(secretId(providerId));
    await this.persist();
    return this.inventory();
  }

  private async load() {
    if (this.catalog) return this.catalog;
    const text = await readFile(this.catalogPath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (!text.trim()) this.catalog = { schemaVersion: 1, providers: [] };
    else {
      const value = JSON.parse(text) as ProviderCatalog;
      if (value.schemaVersion !== 1 || !Array.isArray(value.providers)) {
        throw new Error("Unsupported model gateway provider catalog.");
      }
      this.catalog = value;
    }
    return this.catalog;
  }

  private persist() {
    const content = `${JSON.stringify(this.catalog ?? { schemaVersion: 1, providers: [] }, null, 2)}\n`;
    this.persistQueue = this.persistQueue.then(() => atomicWrite(this.catalogPath, content));
    return this.persistQueue;
  }
}
