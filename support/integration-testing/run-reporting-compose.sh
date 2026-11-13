#!/usr/bin/env bash
set -euo pipefail
: "${RBPORTAL_IMAGE:?Build this checkout with docker build --target test -t redbox-portal:test . and set RBPORTAL_IMAGE=redbox-portal:test}"
mkdir -p coverage/reporting
reporting_compose=(docker compose -p redbox-reporting-tests -f support/integration-testing/docker-compose.reporting.yml)
trap '"${reporting_compose[@]}" down -v --remove-orphans' EXIT
"${reporting_compose[@]}" up --menu=false --abort-on-container-exit --exit-code-from reporting-tests reporting-tests
