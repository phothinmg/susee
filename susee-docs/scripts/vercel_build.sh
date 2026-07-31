#!/usr/bin/env bash
set -euo pipefail

# coverage
npx tsx --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=__tests__/coverage/lcov.info
# pre cache
mkdir -p docs/.jekyll-cache && cp -r node_modules/.jekyll-cache-backup/. docs/.jekyll-cache/ 2>/dev/null || true 
sleep 0.5
# jekyll build
JEKYLL_ENV=production bundle exec jekyll build
sleep 0.5
# mmcov build
bash scripts/mmcov.sh
sleep 1
# post build
mkdir -p node_modules/.jekyll-cache-backup && cp -r docs/.jekyll-cache/. node_modules/.jekyll-cache-backup/