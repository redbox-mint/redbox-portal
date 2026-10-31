#!/usr/bin/env bash
# Keep supervision/status capture outside the bounded npm + tee process group.
set -uo pipefail
exec node support/build/ci-mocha-failure-rehearsal.cjs suite
