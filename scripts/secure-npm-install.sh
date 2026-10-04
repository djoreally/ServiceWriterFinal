#!/usr/bin/env bash
set -euo pipefail

# Install the committed lockfile exactly. Do not mutate package-lock.json inside
# an ephemeral production build.
npm ci

# Production deployment gate: fail on high/critical advisories that are present
# in runtime dependencies. Build/test-only tooling is audited in CI separately
# and must not strand production when npm reports an advisory with no available
# upstream fix (for example Tailwind/Spectral transitive tooling).
npm audit --omit=dev --audit-level=high
