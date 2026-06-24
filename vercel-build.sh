#!/bin/bash

# Check if there are changes in (docs/*|_config.yml|Gemfile|vercel.json)
git diff HEAD^ HEAD --quiet -- docs/ _config.yml Gemfile vercel.json

if [ $? -eq 0 ]; then
  echo "🛑 No relevant docs files changed. Skipping build."
  exit 0
else
  echo "✅ Docs files changed. Proceeding with build."
  exit 1
fi
