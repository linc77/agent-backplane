#!/usr/bin/env bash
set -euo pipefail

files=(
  docs/loop/loops.md
)

missing=0
for file in "${files[@]}"; do
  if [[ ! -e "$file" ]]; then
    printf 'missing loop verification input: %s\n' "$file" >&2
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit "$missing"
fi

while IFS= read -r path; do
  if [[ "$path" == *"*"* ]]; then
    continue
  fi
  if [[ ! -e "$path" ]]; then
    printf 'missing loop artifact: %s\n' "$path" >&2
    missing=1
  fi
done < <(rg -o --no-filename '`docs/loop/[^`]+`' "${files[@]}" | tr -d '`' | sort -u)

exit "$missing"
