#!/usr/bin/env bash
set -euo pipefail

echo "== Service Writer preview certification =="
echo "Node: $(node --version)"
echo "npm:  $(npm --version)"

major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$major" != "24" ]; then
  echo "ERROR: Node 24 is required; found Node $(node --version)." >&2
  exit 1
fi

echo "1/5 npm ci"
npm ci

echo "2/5 architecture boundaries"
npm run verify:boundaries

echo "3/5 TypeScript"
npm run typecheck

echo "4/5 lint"
npm run lint

echo "5/5 Next.js build"
npm run build

echo "CERTIFICATION_BUILD_GREEN"
