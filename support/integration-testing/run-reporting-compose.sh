#!/usr/bin/env bash
set -euo pipefail
reporting_compose=(docker compose -p redbox-reporting-tests -f support/integration-testing/docker-compose.reporting.yml)
trap '"${reporting_compose[@]}" down -v --remove-orphans' EXIT
"${reporting_compose[@]}" up --menu=false --abort-on-container-exit --exit-code-from reporting-tests reporting-tests
