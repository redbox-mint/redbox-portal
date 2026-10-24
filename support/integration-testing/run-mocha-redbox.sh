#!/usr/bin/env bash
set -euo pipefail
# Historical command filename retained for callers; use the sole Express harness.
exec bash "$(dirname "$0")/run-mocha-express.sh" "$@"
