#!/usr/bin/env bash
set -euo pipefail
backend=${1:?selector}
export RBPORTAL_BRANDING_BACKEND=$backend
project="wrp9-bruno-$backend"
compose=(docker compose -p "$project" -f support/integration-testing/docker-compose.mocha.yml -f .tmp/wrp9/portal.override.yml -f .tmp/wrp9/bruno.override.yml --profile mount)
cleanup() {
  "${compose[@]}" logs --no-color redboxportal-mount > ".tmp/wrp9/bruno-$backend-portal.log" 2>&1 || true
  timeout 90 "${compose[@]}" down -v --remove-orphans --timeout 30 > ".tmp/wrp9/bruno-$backend-down.log" 2>&1 || true
}
trap cleanup EXIT
cp test/bruno/environments/int-test.bru .tmp/wrp9/bruno-tests/environments/int-test.bru
timeout 300 "${compose[@]}" up -d --wait mongodb solr keycloak email redboxportal-mount > ".tmp/wrp9/bruno-$backend-up.log" 2>&1
timeout 900 "${compose[@]}" run --rm --no-deps bruno > ".tmp/wrp9/bruno-$backend.log" 2>&1
cp .tmp/wrp9/bruno-tests/result.json ".tmp/wrp9/bruno-$backend-results.json"
