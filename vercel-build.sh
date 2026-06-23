#!/bin/bash

# Check if there are changes in the specific app directories or config files
git diff HEAD^ HEAD --quiet -- app/ _config.yml Gemfile

if [ $? -eq 0 ]; then
  echo "🛑 No relevant files changed. Skipping build."
  exit 0
else
  echo "✅ Important files changed. Proceeding with build."
  exit 1
fi
