# Multi-Agent Configuration Console Design

## Product Boundary

The workspace manages provider profiles and activates them against supported
native Agent config files. AMM owns profile metadata and backup history; each
Agent remains the source of truth for its live runtime configuration.

## Contracts

- `AgentKind`: `codex`, `claudeCode`, or `hermes`.
- `AgentTarget`: installation/config status, config path, active provider/model,
  reload guidance, and profiles.
- `AgentProviderProfile`: non-secret metadata, active state, and `hasSecret`.
- `AgentConfigInventory`: catalog path, Agent targets, and last refresh time.
- `SaveAgentProfileInput`: editable metadata plus an optional write-only secret.
- `AgentActivationResult`: refreshed inventory, backup path, and reload message.

Secrets are write-only inputs. They are stored under a stable Keychain service
and profile account, and never serialized into the AMM catalog or returned to
React.

## Storage

- Catalog: `~/.agent-memory-manager/agent-config-profiles.json`, mode `0600`.
- Backups: `~/.agent-memory-manager/backups/agent-config/<agent>/<timestamp>/`.
- Secrets: macOS Keychain service
  `com.linc.agent-memory-manager.agent-provider`.

The catalog uses atomic temporary-file persistence. Native writes first validate
the source, create a backup, build a patched document in memory, validate the
result, and atomically replace the destination.

## Adapter Boundary

Rust exposes a small `AgentConfigAdapter` boundary with inspect and apply
operations. The first implementation dispatches to three native adapters:

- Claude Code: parse JSON, preserve top-level settings, and update only managed
  Anthropic environment keys.
- Codex: use `toml_edit` to preserve unrelated TOML while updating `model`,
  `model_provider`, and an AMM-owned `model_providers` table. Official profiles
  keep `auth.json` untouched.
- Hermes: parse YAML for validation, then replace only the top-level `model`
  and `custom_providers` sections so comments and unrelated settings survive.

## Import and Identity

On first load, each supported Agent gets one imported profile derived from the
currently active native config. Profile IDs are AMM-generated and stable.
Custom provider keys are normalized to lowercase letters, digits, and hyphens.
Activating a profile updates the catalog's active ID only after the native write
succeeds.

## UI Flow

The Agents view uses the full workspace. A segmented control at the top selects
the Agent. Cards show the active profile, name, endpoint, model, credential
presence, and status. The add/edit dialog accepts normalized fields and treats
the API key as write-only. Activation is explicit and refreshes the inventory.

## Safety and Rollback

- Never log or return secrets.
- Reject invalid URLs, empty models, reserved provider keys, malformed native
  configs, and path escapes.
- Serialize writes with a process-wide lock.
- Preserve official Codex and OAuth files.
- Leave the catalog unchanged when native activation fails.
- A failed atomic replacement leaves the original config and backup available.
