#!/usr/bin/env bash
set -euo pipefail
: "${RBPORTAL_IMAGE:?Build this checkout with docker build --target test -t redbox-portal:test . and set RBPORTAL_IMAGE=redbox-portal:test}"
mkdir -p coverage/reporting
# The image runs as node (UID 1000), which can differ from the CI host user.
chmod a+rwx coverage/reporting
reporting_compose=(docker compose -p redbox-reporting-tests -f support/integration-testing/docker-compose.reporting.yml)
cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    "${reporting_compose[@]}" ps -a || true
    "${reporting_compose[@]}" logs --no-color --tail=200 reporting-mongo || true
  fi
  "${reporting_compose[@]}" down -v --remove-orphans
}
trap cleanup EXIT
"${reporting_compose[@]}" up --menu=false --abort-on-container-exit --exit-code-from reporting-tests reporting-tests
