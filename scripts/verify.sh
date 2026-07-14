#!/usr/bin/env bash
set -euo pipefail

pnpm exec vitest run
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
node scripts/verify-profile-cache.mjs --optional
bash scripts/verify-loop.sh
git diff --check
