#!/usr/bin/env bash
set -euo pipefail
export RBPORTAL_CACHE_BACKEND="$1"
printf 'P5 full core requested backend=%s; unit suites select their own fixtures; live selections asserted in transition and portal runs.\n' "$RBPORTAL_CACHE_BACKEND"
npm run test:core
