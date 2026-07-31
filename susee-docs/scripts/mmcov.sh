#!/usr/bin/env bash
set -euo pipefail

cd ..
sleep 0.5
npx tsx --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=__tests__/coverage/lcov.info
sleep 1
npx mmcov __tests__/coverage/lcov.info --out susee-docs/_site/coverage --project susee --source src --favicon susee-docs/public/favicons/favicon.ico --mmdocs
sleep 1
cd susee-docs
echo "mmcov build done"
