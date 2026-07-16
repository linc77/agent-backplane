# Agent Memory Manager

Electron desktop app for understanding and controlling what local Agents know and can do. It keeps Codex, Claude Code, and Hermes contexts separate, inspects Memory, discovers Skills and MCP servers, and manages each Agent's provider profiles.

Skills are discovered directly from native global and project directories. The app groups identical filesystem copies into logical capabilities and writes only a derived snapshot to `~/.agent-memory-manager/skill-inventory.json`.

## Downloads

Installers are published on [GitHub Releases](https://github.com/linc77/agent-memory-manager/releases/latest):

- macOS Apple Silicon: `.dmg`
- Windows x64: NSIS `.exe`

The first Electron builds are unsigned. macOS Gatekeeper or Windows SmartScreen may require explicit confirmation before opening them. The app can check for new GitHub releases from Settings and opens the release page for manual download.

## Development

```bash
pnpm install
pnpm dev
```

Build an unpacked desktop app:

```bash
pnpm build:desktop:debug
```

Build the configured installer for the current platform:

```bash
pnpm build:desktop
```

## Checks

```bash
pnpm verify
```
