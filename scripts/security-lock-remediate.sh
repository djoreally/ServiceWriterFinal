#!/usr/bin/env bash
set -euo pipefail

npm ci
npm audit fix --package-lock-only
npm ci
npm audit

if ! git diff --quiet -- package-lock.json; then
  git config user.name "vercel-security-bot"
  git config user.email "security@servicewriter.xyz"
  git add package-lock.json
  git commit -m "Apply npm audit lockfile remediation"
  git push origin HEAD:main
fi
