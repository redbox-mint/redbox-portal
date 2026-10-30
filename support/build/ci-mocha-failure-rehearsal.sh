#!/usr/bin/env bash
# The child npm command already preserves Compose up status across down.
# Keep errexit off until PIPESTATUS is saved; tee must never mask that status.
set -uo pipefail
node support/build/ci-mocha-failure-rehearsal.cjs ready || exit 1
timeout 1800s npm run test:mocha:ci 2>&1 | tee .tmp/ci-mocha-failure-rehearsal/suite.log
rehearsal_statuses=("${PIPESTATUS[@]}")
node support/build/ci-mocha-failure-rehearsal.cjs record-status "${rehearsal_statuses[0]}" "${rehearsal_statuses[1]}"
rehearsal_record_status=$?
if (( rehearsal_statuses[0] != 0 )); then
  exit "${rehearsal_statuses[0]}"
fi
echo "Rehearsal unexpectedly returned zero; refusing a green validation gate (record status ${rehearsal_record_status})." >&2
exit 1
