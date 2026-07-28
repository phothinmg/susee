#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

# to susee
npx mmcov __tests__/coverage/lcov.info --out _site/coverage --project susee --source src --favicon docs/public/favicons/favicon.ico --mmdocs
