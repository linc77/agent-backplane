import { homedir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { EncryptedFileSecretStore } from "./encryptedSecretStore";

export class ElectronSecretStore extends EncryptedFileSecretStore {
  constructor(path = join(homedir(), ".agent-memory-manager", "agent-config-secrets.json")) {
    super(path, {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    });
  }
}
