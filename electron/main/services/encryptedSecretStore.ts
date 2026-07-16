import { readFile } from "node:fs/promises";
import type { SecretStore } from "./agentConfig";
import { atomicWrite } from "./shared";

export interface SecretEncryption {
  isAvailable(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}
export class EncryptedFileSecretStore implements SecretStore {
  constructor(
    private readonly path: string,
    private readonly encryption: SecretEncryption,
  ) {}

  private async load() {
    const text = await readFile(this.path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "{}";
      throw error;
    });
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, string>
      : {};
  }

  async get(profileId: string) {
    const encrypted = (await this.load())[profileId];
    if (!encrypted || !this.encryption.isAvailable()) return null;
    try {
      return this.encryption.decrypt(Buffer.from(encrypted, "base64"));
    } catch {
      return null;
    }
  }

  async set(profileId: string, secret: string) {
    if (!this.encryption.isAvailable()) throw new Error("system credential encryption is unavailable");
    const values = await this.load();
    values[profileId] = this.encryption.encrypt(secret).toString("base64");
    await atomicWrite(this.path, `${JSON.stringify(values, null, 2)}\n`);
  }

  async delete(profileId: string) {
    const values = await this.load();
    delete values[profileId];
    await atomicWrite(this.path, `${JSON.stringify(values, null, 2)}\n`);
  }
}
