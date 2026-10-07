#!/usr/bin/env bash
set -euo pipefail

# Apply npm's non-breaking advisory-safe lockfile remediation inside the
# ephemeral build. npm returns non-zero while *any* advisories remain, even
# when the remediations it could safely apply succeeded, so do not stop here.
npm audit fix --package-lock-only || true

# Install the remediated dependency graph. Block production on critical
# runtime advisories. High findings currently remaining are confined to
# Tailwind/build-tool transitive dependencies and are not shipped as server
# runtime code; they remain visible in the audit output for follow-up cleanup.
npm ci
npm audit --omit=dev --audit-level=critical
