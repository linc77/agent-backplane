import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EncryptedFileSecretStore, type SecretEncryption } from "./encryptedSecretStore";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const encryption: SecretEncryption = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0x5a)),
  decrypt: (value) => Buffer.from(value.map((byte) => byte ^ 0x5a)).toString("utf8"),
};

describe("encrypted Agent secret storage", () => {
  it("persists ciphertext only and supports deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "amm-secrets-"));
    roots.push(root);
    const path = join(root, "secrets.json");
    const store = new EncryptedFileSecretStore(path, encryption);
    await store.set("profile-1", "sk-plaintext-secret");
    expect(await store.get("profile-1")).toBe("sk-plaintext-secret");
    expect(await readFile(path, "utf8")).not.toContain("sk-plaintext-secret");
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
    await store.delete("profile-1");
    expect(await store.get("profile-1")).toBeNull();
  });

  it("refuses plaintext fallback when encryption is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "amm-secrets-"));
    roots.push(root);
    const store = new EncryptedFileSecretStore(join(root, "secrets.json"), {
      ...encryption,
      isAvailable: () => false,
    });
    await expect(store.set("profile-1", "secret")).rejects.toThrow("encryption is unavailable");
  });
});
