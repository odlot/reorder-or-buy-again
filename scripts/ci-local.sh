#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Running validation"
./scripts/validate.sh

echo "==> Installing Node dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Installing Playwright browser"
if [[ "${CI_LOCAL_WITH_DEPS:-0}" == "1" ]]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi

echo "==> Running end-to-end tests"
./scripts/test-e2e.sh

echo "==> Local CI flow passed"
