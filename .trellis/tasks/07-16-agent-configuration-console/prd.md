# Add multi-agent configuration console

## Goal

Add a native Agent configuration workspace inspired by CC Switch. Users can
switch the workspace between Codex, Claude Code, and Hermes, manage multiple
provider profiles for each Agent, and activate a profile against the Agent's
real local configuration.

## Confirmed Facts

- The app is a Tauri 2 + React desktop application with full-width Skills mode.
- Codex, Claude Code, and Hermes are installed on the development machine.
- Their active user configuration sources are `~/.codex/config.toml`,
  `~/.claude/settings.json`, and `~/.hermes/config.yaml`.
- Codex custom providers use `model_provider` plus `model_providers.<id>` in
  user-level TOML and support the Responses protocol.
- Claude Code gateway profiles use the `env` object in `settings.json`.
- Hermes persists provider/model/base URL in the `model` YAML section and
  supports additive named custom providers.

## Requirements

- Add an `Agents` primary navigation item and a full-width workspace.
- Add a top Agent switcher for Codex, Claude Code, and Hermes.
- Show installation status, native config path, current provider, model, base
  URL, and restart/reload guidance for each Agent.
- Maintain an AMM-owned provider-profile catalog per Agent.
- Import the currently active native configuration as an initial profile when
  no AMM profile exists for that Agent.
- Support adding, editing, deleting, and activating custom profiles.
- Store API credentials in macOS Keychain; never return or persist plaintext
  credentials in the AMM catalog or frontend inventory payload.
- Preserve unrelated keys and sections in every native Agent config.
- Create a backup before activation and use atomic writes.
- Validate profile names, provider keys, endpoint URLs, model names, and native
  config syntax before writes.
- Keep fixture mode deterministic and cover all three Agents.
- Surface activation failures and backup paths without pretending a switch
  succeeded.

## Acceptance Criteria

- [x] Sidebar navigation opens an Agents workspace without the memory Inspector.
- [x] The top switcher changes between Codex, Claude Code, and Hermes profiles.
- [x] The real local inventory identifies all three installed Agents and their
      native config paths without exposing credentials.
- [x] A user can create and edit a provider profile with name, provider key,
      base URL, model, and optional API key.
- [x] Activating a Claude profile updates only managed `settings.json.env` keys.
- [x] Activating a Codex profile updates only the selected model/provider and
      the AMM-owned provider table while preserving official authentication.
- [x] Activating a Hermes profile updates the model selection and additive
      custom-provider entry without dropping unrelated YAML sections.
- [x] Every successful activation creates a restorable backup and writes
      atomically.
- [x] AMM catalog snapshots and Tauri payloads contain no plaintext API keys.
- [x] Focused Rust/frontend tests and `pnpm verify` pass.
- [x] Live desktop verification confirms the three-Agent switching flow.

## Out of Scope

- Balance or usage queries.
- Local protocol-conversion proxy and failover routing.
- OAuth/device-code login flows.
- MCP, Skill, prompt, or memory deployment from this screen.
- Agents other than Codex, Claude Code, and Hermes.
