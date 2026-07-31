#!/usr/bin/env bash
set -euo pipefail

cd ..
# to susee
npx mmcov __tests__/coverage/lcov.info --out susee-docs/_site/coverage --project susee --source src --favicon susee-docs/public/favicons/favicon.ico --mmdocs
sleep 1
cd susee-docs
echo "mmcov build done"
