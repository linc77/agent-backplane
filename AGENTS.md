# Codex

## Environment

- macOS 26
- Node 22
- Shell fish

## Protocol

- User-facing replies must be Chinese.
- Tool commands, model prompts, and code-facing text should be English.
- Keep code, comments, and docs concise. Do not add commentary unless it protects correctness.
- Make only targeted changes for the active request.

## Project Map

- `README.md`: project purpose and basic commands.
- `docs/loop/loops.md`: loop index; read before opening loop goals, issues, or verification records.
- `docs/loop/goals/`: long-running Codex goals and success criteria.
- `docs/loop/verification/`: live verification records.
- `docs/loop/issues/`: known gaps and focused follow-up tasks.

## Checks

Run the smallest relevant set first:

```bash
pnpm verify
```

`pnpm verify` runs:

```bash
pnpm exec vitest run
pnpm build
node scripts/verify-profile-cache.mjs --optional
bash scripts/verify-loop.sh
git diff --check
```

Use `pnpm dev` or `pnpm build:desktop:debug` for live desktop verification.
