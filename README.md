# Agent Backplane

**Backplane** is the desktop control plane for understanding and controlling what local Agents know and can do. Agent Backplane keeps Codex, Claude Code, and Hermes contexts separate, inspects Memory, discovers Skills and MCP servers, and manages each Agent's provider profiles.

Skills are discovered directly from native global and project directories. The app groups identical filesystem copies into logical capabilities and writes only a derived snapshot to `~/.agent-backplane/skill-inventory.json`.

## Downloads

Installers are published on [GitHub Releases](https://github.com/linc77/agent-backplane/releases/latest):

- macOS Apple Silicon: `.dmg`
- Windows x64: NSIS `.exe`

Desktop releases are currently unsigned. macOS users may need to approve the app in System Settings on first launch. The in-app updater can check and download releases, but unsigned macOS updates do not provide the trust guarantees of Developer ID signing and notarization.

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
