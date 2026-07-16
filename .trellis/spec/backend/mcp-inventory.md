# MCP Inventory Contract

## 1. Scope / Trigger

Use this contract when changing MCP discovery, native config parsing, transport
or enabled-state detection, Electron payloads, or the MCP UI. This inventory is
read-only and must be redacted before serialization.

## 2. Signatures

```ts
loadMcpInventory(agent: AgentKind): Promise<McpInventory>
window.amm.mcp.load(agent: AgentKind): Promise<McpInventory>
```

Frontend:

```ts
loadMcpInventory(agent: AgentKind): Promise<McpInventory>
```

## 3. Contracts

- Codex reads `${CODEX_HOME:-~/.codex}/config.toml` table `mcp_servers`.
- Claude Code reads user/local declarations from `~/.claude.json` and shared
  project declarations from `<project>/.mcp.json` for known project paths.
- Hermes reads `${HERMES_HOME:-~/.hermes}/config.yaml` key `mcp_servers`.
- Codex and Hermes use `enabled = false` to disable a server. A legacy
  `disabled = true` field may also be honored; explicit `enabled` wins.
- Hermes transport comes from `transport` (with `type` accepted as a secondary
  representation); Claude Code uses `type`; command/url inference is fallback.
- The serialized endpoint is only a command basename or URL origin. URL user
  info, path, query, and fragment are removed.
- Never serialize command arguments, environment maps, headers, bearer-token
  references, OAuth tokens, keys, passwords, or raw configuration documents.
- Parse failures return sanitized messages without embedding source lines.
- The UI is read-only and keys its query by `AgentKind`.

## 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Config path is missing | Empty server list and declared config path |
| Native config is invalid | Sanitized Agent-specific parse error |
| Claude project `.mcp.json` is invalid | Error names the path but not its contents |
| URL contains user info, query, path, or fragment | Return only `scheme://host[:port]` |
| Args/env/headers contain fixture secrets | Serialized inventory contains none |
| `enabled = false` | Server remains visible with `enabled=false` |

## 5. Good / Base / Bad Cases

- Good: Claude user, local-project, and shared-project servers are visible as
  separate scoped declarations without exposing their arguments.
- Base: Missing Hermes config returns an empty Hermes inventory.
- Bad: Return the full command line or remote URL to React.
- Bad: Treat a Codex `enabled = false` server as enabled because only
  `disabled` was checked.

## 6. Tests Required

- Parse each Agent's native format with stdio and remote transports.
- Assert Codex/Hermes `enabled = false` is retained.
- Assert Claude `.mcp.json` paths and servers are included.
- Serialize fixtures containing args, env, headers, user info, path, query, and
  tokens; assert every secret marker is absent.
- Verify the renderer calls the named `window.amm.mcp.load(agent)` method.
- Fixture UI switching changes server rows without stale rows from another
  Agent.

## 7. Wrong vs Correct

### Wrong

```ts
return { endpoint: config.url, args: config.args };
```

### Correct

```ts
return { endpoint: safeEndpoint(command, url), enabled: enabled(config) };
```

Redaction happens in Electron main, before any value crosses IPC.
