#!/usr/bin/env bash
set -euo pipefail

# jekyll build
JEKYLL_ENV=production bundle exec jekyll build
sleep 0.5
# mmcov build
bash scripts/mmcov.sh
sleep 1
node scripts/dev_server.mjs