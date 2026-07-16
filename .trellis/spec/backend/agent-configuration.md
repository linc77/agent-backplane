# Agent Configuration Contract

## Scenario: Native Agent provider switching

### 1. Scope / Trigger

Read this contract before changing Codex, Claude Code, or Hermes profile
persistence, native adapters, `safeStorage`, backups, IPC, or the Agent manager
UI. AMM owns managed fields but preserves unrelated native configuration.

### 2. Signatures

```ts
window.amm.agentConfig.load(): Promise<AgentConfigInventory>
window.amm.agentConfig.save(input: SaveAgentProfileInput): Promise<AgentConfigInventory>
window.amm.agentConfig.delete(agent: AgentKind, profileId: string): Promise<AgentConfigInventory>
window.amm.agentConfig.activate(agent: AgentKind, profileId: string): Promise<AgentActivationResult>
```

### 3. Contracts

- `AgentKind`: `codex | claudeCode | hermes`.
- `AgentProtocol`: `responses | anthropicMessages | chatCompletions`.
- Catalog: `~/.agent-memory-manager/agent-config-profiles.json`, mode 0600,
  metadata only.
- New credentials: Electron `safeStorage` ciphertext in
  `~/.agent-memory-manager/agent-config-secrets.json`, mode 0600.
- Rust keyring credentials are intentionally not migrated. Existing profiles
  stay visible with `hasSecret=false` until the user enters a new key.
- Secrets never cross IPC. Activation may write a key into an Agent-native
  format only when that format requires it.
- Native files: Codex `${CODEX_HOME:-~/.codex}/config.toml`, Claude Code
  `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json`, Hermes
  `${HERMES_HOME:-~/.hermes}/config.yaml`.
- Activation creates a timestamped backup below
  `~/.agent-memory-manager/backups/agent-config/<agent>/` and atomically
  replaces the native file.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Empty name/model/provider key | Reject before writing |
| Custom URL lacks HTTP(S) | Reject before writing |
| Codex is not Responses | Reject |
| Claude Code is not Anthropic Messages | Reject |
| Codex custom key is reserved | Reject |
| Profile belongs to another Agent | Reject Agent change |
| Delete profile matching live config | Reject until another profile is active |
| Native JSON/TOML/YAML is invalid | Parse error; do not overwrite |
| `safeStorage` unavailable | Reject key save; never downgrade to plaintext |

### 5. Good / Base / Bad Cases

- Good: activating a managed gateway preserves unrelated fields, backs up the
  file, atomically writes managed fields, and returns redacted inventory.
- Base: first load imports metadata for each current native config without
  importing its embedded API key.
- Bad: serialize `apiKey` into catalog/inventory or read a legacy key into the
  new encrypted store automatically.

### 6. Tests Required

- Temporary-home tests for all three adapters and unrelated field preservation.
- Catalog and serialized inventory contain no fixture secrets.
- Legacy native secrets do not set `hasSecret` in a new Electron store.
- Invalid profile input fails before native writes.
- Activation returns backup/reload feedback and updates active state.
- UI never renders an API key value.

### 7. Wrong vs Correct

#### Wrong

```ts
await writeFile(configPath, generatedFromProfile);
await writeFile(catalogPath, JSON.stringify({ ...profile, apiKey }));
```

#### Correct

```ts
const next = await buildNativeConfig(agent, configPath, profile, await secrets.get(profile.id));
const backupPath = await createBackup(paths, agent, configPath);
await atomicWrite(configPath, next);
```

Parse the current document first, mutate owned fields only, and keep plaintext
inside the main process.
