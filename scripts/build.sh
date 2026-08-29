#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

npx napi build --platform --config-path napi.config.json
mkdir -p bin

cat <<EOF > bin/susee
#!/usr/bin/env node

var {cliBuild} = require("../index.js")
cliBuild(process.argv.slice(2));
EOF

rm -rf susee.linux-x64-gnu.node