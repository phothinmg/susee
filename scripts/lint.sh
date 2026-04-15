#!/usr/bin/env bash
set -euo pipefail

npx biome check src  --write && npm run lint --workspaces --if-present