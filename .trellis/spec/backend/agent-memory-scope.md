# Agent Memory Scope Contract

## 1. Scope / Trigger

Use this contract when adding an Agent memory adapter, changing native memory
paths, scanning sources, building read-only profiles, or exposing Memory through
Electron. The primary safety rule is that one Agent's sources are never labeled as
another Agent's memory.

## 2. Signatures

```ts
defaultAgentMemoryRoot(agent: AgentKind): string
scanAgentSources(agent: AgentKind, root: string): Promise<MemorySource[]>
window.amm.memory.loadAgentSnapshot(agent: AgentKind): Promise<AgentMemorySnapshot>
```

Response:

```ts
type AgentMemorySnapshot = { agent: AgentKind; writable: boolean; scan: ScanResult; profile: MemoryProfile };
```

## 3. Contracts

- Codex: existing `~/.codex/memories` scanner and write/Audit pipeline.
- Claude Code: `${CLAUDE_CONFIG_DIR:-~/.claude}/projects`, one project level,
  project `MEMORY.md`, and direct `memory/*.md` files.
- Hermes: `${HERMES_HOME:-~/.hermes}/memories`, top-level `MEMORY.md` and
  `USER.md` only.
- Missing roots return an empty inventory, not data from a fallback Agent.
- Relative paths retain the Claude project-directory prefix so source and entry
  identities cannot collide across projects.
- Claude/Hermes profiles use the existing deterministic parser/truth pipeline
  without writing `.amm/profile.json` into foreign Agent directories.
- `writable` is true only for Codex. Source excerpts receive the returned scan
  root so canonical-path checks remain active.
- Environment keys are optional and blank values behave as unset.

## 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Agent root does not exist | Empty `sources`, `entries`, and profile sections |
| Declared source is unreadable | Command error; do not fall back to Codex |
| Claude project contains unrelated root Markdown | Ignore it |
| Hermes contains `notes.md` or nested Markdown | Ignore it |
| Source path is outside returned root | Excerpt command rejects it |
| Non-Codex correction request | Frontend does not expose the action |

## 5. Good / Base / Bad Cases

- Good: Two Claude projects expose stable prefixed source paths and one
  deterministic read-only profile.
- Base: Hermes has only `USER.md`; return one source and one profile input.
- Bad: If Claude's directory is missing, call the Codex scanner and relabel the
  result.
- Bad: Cache a generated profile inside `~/.claude` or `~/.hermes`.

## 6. Tests Required

- Resolve Codex, Claude Code, and Hermes roots with environment behavior.
- Claude scanner includes legacy/project memory and excludes unrelated files.
- Hermes scanner includes exactly `MEMORY.md` and `USER.md`.
- Frontend fixture text is distinct for all three Agents.
- Non-Codex UI has no Audit, correction, regeneration, or write controls.

## 7. Wrong vs Correct

### Wrong

```ts
const sources = await scanSources(defaultMemoryRoot());
```

### Correct

```ts
const root = defaultAgentMemoryRoot(agent);
const sources = await scanAgentSources(agent, root);
const profile = buildMemoryProfileWithoutCache(root, sources, entries, risks);
```
