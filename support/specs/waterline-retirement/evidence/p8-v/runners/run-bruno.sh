#!/usr/bin/env bash
set -euo pipefail
backend=${1:?selector}
export RBPORTAL_VOCABULARY_BACKEND=$backend
project="wrp8-bruno-$backend"
compose=(docker compose -p "$project" -f support/integration-testing/docker-compose.mocha.yml -f .tmp/wrp8/portal.override.yml -f .tmp/wrp8/bruno.override.yml --profile mount)
cleanup() {
  "${compose[@]}" logs --no-color redboxportal-mount > ".tmp/wrp8/bruno-$backend-portal.log" 2>&1 || true
  timeout 90 "${compose[@]}" down -v --remove-orphans --timeout 30 > ".tmp/wrp8/bruno-$backend-down.log" 2>&1 || true
}
trap cleanup EXIT
cp test/bruno/environments/int-test.bru .tmp/wrp8/bruno-tests/environments/int-test.bru
timeout 300 "${compose[@]}" up -d --wait mongodb solr keycloak email redboxportal-mount > ".tmp/wrp8/bruno-$backend-up.log" 2>&1
timeout 900 "${compose[@]}" run --rm --no-deps bruno > ".tmp/wrp8/bruno-$backend.log" 2>&1
cp .tmp/wrp8/bruno-tests/result.json ".tmp/wrp8/bruno-$backend-results.json"
