# Agent Backplane

**Backplane** is the desktop control plane for understanding and controlling what local Agents know and can do. Agent Backplane keeps Codex, Claude Code, and Hermes contexts separate, inspects Memory, discovers Skills and MCP servers, and manages each Agent's provider profiles.

Skills are discovered directly from native global and project directories. The app groups identical filesystem copies into logical capabilities and writes only a derived snapshot to `~/.agent-backplane/skill-inventory.json`.

## Downloads

Installers are published on [GitHub Releases](https://github.com/linc77/agent-memory-manager/releases/latest):

- macOS Apple Silicon: `.dmg`
- Windows x64: NSIS `.exe`

The first Electron builds (`v0.2.0` and `v0.2.1`) are unsigned and require one final manual upgrade. The first signed updater-enabled release and later versions can check, download, install, and restart from Settings. macOS updater releases require Developer ID signing and notarization; release CI fails instead of publishing an unsigned macOS updater.

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
