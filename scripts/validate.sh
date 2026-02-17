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

echo "Running tests"
node --test tests/*.test.js

echo "Validation passed."
