#!/usr/bin/env bash
set -euo pipefail

pnpm exec vitest run
pnpm build
node scripts/verify-profile-cache.mjs --optional
bash scripts/verify-loop.sh
git diff --check
