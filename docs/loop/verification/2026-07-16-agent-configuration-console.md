# Agent Configuration Console Verification

Status: complete
Date: 2026-07-16
Trellis task: `.trellis/tasks/07-16-agent-configuration-console/`

## Acceptance Target

AMM provides a CC Switch-style Agent workspace for Codex, Claude Code, and
Hermes. Users can switch Agent targets, manage provider/model profiles, and
activate a profile through the real native config files without exposing
credentials or erasing unrelated settings.

## Delivered

- Added an `Agents` workspace with a segmented Claude Code / Codex / Hermes
  switcher, detected runtime status, current native configuration, provider
  cards, create/edit/delete actions, and activation feedback.
- Added typed Tauri commands for inventory, save, delete, and activation.
- Imports the current native profile from `~/.codex/config.toml`,
  `~/.claude/settings.json`, and `~/.hermes/config.yaml`.
- Stores AMM profile metadata in
  `~/.agent-memory-manager/agent-config-profiles.json` and credentials in the
  native credential store (macOS Keychain or Windows Credential Manager).
- Creates timestamped backups before activation and replaces native files
  atomically with mode `0600`.
- Preserves unrelated Codex TOML tables, Claude JSON settings, and Hermes YAML
  sections/comments.
- Added deterministic fixture data and Chinese/English UI strings.
- Captured the cross-layer contract in
  `.trellis/spec/backend/agent-configuration.md`.

## Automated Evidence

```bash
pnpm verify
```

Result: passed.

- Vitest: 5 files, 38 tests passed.
- Rust: 65 tests passed, including 6 Agent configuration adapter tests.
- TypeScript/Vite production build passed.
- Cargo check passed.
- Profile cache, Loop references, and `git diff --check` passed.

The focused adapter tests verify native-field updates, unrelated-setting
preservation, invalid-input rejection, and catalog secret redaction for all
three Agents.

## Browser Evidence

Opened `http://localhost:1420/?fixture=1` in the in-app browser at a 1440x900
desktop viewport.

- Agents opened as a full-width workspace without the memory evidence pane.
- Codex showed one active official profile and one managed gateway profile.
- Claude Code and Hermes targets switched from the segmented control.
- The create dialog exposed Agent-specific protocol behavior and a write-only
  API key field with macOS Keychain guidance.
- Activation returned backup/reload feedback in fixture mode.
- Layout dimensions were `1440px` viewport, body, and shell width with no
  horizontal overflow; browser console contained no errors.

## Safety Boundary

Browser interaction used fixture mode, so visual verification did not modify
the user's real Agent configs. Native writes were exercised only against
temporary test fixtures. No files were staged or committed.
