# Agent Configuration Contract

## Scenario: Native Agent provider switching

### 1. Scope / Trigger

- Applies to Codex, Claude Code, and Hermes provider profiles exposed by AMM.
- Read and follow this contract before changing profile persistence, native config adapters, Keychain access, Tauri commands, or the Agent manager UI.
- AMM owns its catalog, credentials, backups, and managed native fields. It must preserve unrelated native configuration.

### 2. Signatures

```rust
load_agent_config_inventory() -> Result<AgentConfigInventory, String>
save_agent_provider_profile(input: SaveAgentProfileInput) -> Result<AgentConfigInventory, String>
delete_agent_provider_profile(agent: AgentKind, profile_id: String) -> Result<AgentConfigInventory, String>
activate_agent_provider_profile(agent: AgentKind, profile_id: String) -> Result<AgentActivationResult, String>
```

Frontend wrappers use the same command names and camelCase fields. Tauri maps `profileId` to `profile_id`.

### 3. Contracts

- `AgentKind`: `codex | claudeCode | hermes`.
- `AgentProtocol`: `responses | anthropicMessages | chatCompletions`.
- `SaveAgentProfileInput`: `id`, `agent`, `name`, `providerKey`, `baseUrl`, `model`, `protocol`, `official`, `apiKey`, `clearSecret`.
- `AgentConfigInventory.targets[]` includes installation state, executable/config paths, detected active fields, and redacted profiles.
- `AgentActivationResult` includes refreshed inventory, optional `backupPath`, and `reloadHint`.
- AMM catalog: `~/.agent-memory-manager/agent-config-profiles.json`, mode `0600`, no API key fields.
- Credentials: macOS Keychain service `com.linc.agent-memory-manager.agent-provider`, account is the profile id.
- The AMM catalog and frontend never receive plaintext credentials. Activation may materialize a credential in an Agent's native config when that Agent's supported format requires it.
- Native files: Codex `~/.codex/config.toml`, Claude Code `~/.claude/settings.json`, Hermes `~/.hermes/config.yaml`. Respect `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, and `HERMES_HOME` overrides.
- Before activation, copy an existing native file below `~/.agent-memory-manager/backups/agent-config/<agent>/` and replace the native file atomically.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Empty name/model/provider key | Reject without writing |
| Custom profile URL lacks `http://` or `https://` | Reject without writing |
| Codex protocol is not Responses | Reject |
| Claude Code protocol is not Anthropic Messages | Reject |
| Codex custom key is `openai`, `ollama`, or `lmstudio` | Reject reserved key |
| Profile id belongs to another Agent | Reject Agent change |
| Delete profile matching live native config | Reject until another profile is active |
| Native JSON/TOML/YAML is invalid | Return parse error; do not overwrite |
| Keychain operation fails | Return error; never downgrade to catalog plaintext |

### 5. Good / Base / Bad Cases

- Good: Activate a managed Codex gateway; preserve unrelated TOML tables, create a backup, atomically write managed fields, and return a redacted inventory.
- Base: On first load, import one profile per Agent from existing native files; move discovered native credentials to Keychain and store only `hasSecret` in the response.
- Bad: Serialize `apiKey` into the AMM catalog or return it to React.
- Bad: Regenerate an entire Claude/Hermes config and erase hooks, permissions, tools, or unrelated provider entries.

### 6. Tests Required

- Rust adapter tests with temporary home directories:
  - Claude activation preserves unrelated JSON and changes only managed `env` keys.
  - Codex activation preserves unrelated TOML tables and writes `wire_api = "responses"`.
  - Hermes activation preserves unrelated YAML/comments and updates `model` plus the selected custom provider.
  - Catalog text and serialized inventory do not contain fixture secrets.
  - Invalid profile inputs fail before native writes.
- Frontend/API tests:
  - All three Agent targets render and switch.
  - Activation updates active profile and displays backup/reload feedback.
  - Desktop wrappers pass exact Tauri command names and arguments.
  - UI never renders an API key value.

### 7. Wrong vs Correct

#### Wrong

```rust
fs::write(config_path, generated_from_profile)?; // destroys unrelated settings; no backup
```

#### Correct

```rust
let next = build_native_config(agent, config_path, profile, secret)?;
let backup = create_backup(paths, agent, config_path)?;
atomic_write(config_path, next.as_bytes(), 0o600)?;
```

The adapter must parse the current native document first and mutate only the fields AMM owns.
