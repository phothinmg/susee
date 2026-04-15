#!/usr/bin/env bash
set -euo pipefail

npx biome format --write && npm run fmt --workspaces --if-present