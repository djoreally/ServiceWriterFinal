#!/usr/bin/env bash
set -euo pipefail

# Apply only npm's non-breaking advisory-safe lockfile updates before install.
npm audit fix --package-lock-only
npm ci
# Security gate: any remaining low-or-higher advisory fails the deployment.
npm audit --audit-level=low
