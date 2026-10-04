#!/usr/bin/env bash
set -euo pipefail

# Apply npm's non-breaking advisory-safe lockfile remediation inside the
# ephemeral build. npm returns non-zero while *any* advisories remain, even
# when the remediations it could safely apply succeeded, so do not stop here.
npm audit fix --package-lock-only || true

# Install the remediated dependency graph, then enforce the real production
# boundary: no high/critical advisories in runtime dependencies.
npm ci
npm audit --omit=dev --audit-level=high
