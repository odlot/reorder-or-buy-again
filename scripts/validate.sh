#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for file in src/*.js; do
  if [[ ! -f "$file" ]]; then
    echo "No JavaScript files found in src/"
    exit 1
  fi

  echo "Checking $file"
  node --check "$file"
done

for file in tests/*.test.js; do
  if [[ ! -f "$file" ]]; then
    echo "No tests found in tests/"
    exit 1
  fi

  echo "Checking $file"
  node --check "$file"
done

for file in tests/e2e/*.spec.js; do
  if [[ ! -f "$file" ]]; then
    continue
  fi

  echo "Checking $file"
  node --check "$file"
done

for file in scripts/*.sh; do
  if [[ ! -f "$file" ]]; then
    continue
  fi

  echo "Checking $file"
  bash -n "$file"
done

if command -v shellcheck >/dev/null 2>&1; then
  echo "Running shellcheck"
  shellcheck scripts/*.sh .githooks/pre-commit
else
  echo "shellcheck not found; skipping shell lint."
fi

if command -v actionlint >/dev/null 2>&1; then
  echo "Running actionlint"
  actionlint
else
  echo "actionlint not found; skipping workflow lint."
fi

echo "Running tests"
node --test tests/*.test.js

echo "Validation passed."
