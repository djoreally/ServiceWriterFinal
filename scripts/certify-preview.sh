#!/usr/bin/env bash
set -euo pipefail

echo "== Service Writer preview certification =="
echo "Node: $(node --version)"
echo "npm:  $(npm --version)"

major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$major" -lt "20" ]; then
  echo "ERROR: Node 20+ is required; found Node $(node --version)." >&2
  exit 1
fi

echo "1/6 npm ci"
npm ci

echo "2/6 architecture boundaries"
npm run verify:boundaries

echo "3/6 white-box & grey-box tests"
npm test

echo "4/6 TypeScript"
npm run typecheck

echo "5/6 lint"
npm run lint

echo "6/6 Next.js build"
npm run build

echo "CERTIFICATION_BUILD_GREEN"
