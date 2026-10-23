#!/usr/bin/env bash
set -euo pipefail
export RBPORTAL_IMAGE=node:24.16.0-bookworm
backend=${1:?selector}
if [[ $backend == default ]]; then unset RBPORTAL_BRANDING_BACKEND; else export RBPORTAL_BRANDING_BACKEND=$backend; fi
project="wrp9-mocha-$backend"
compose=(docker compose -p "$project" -f support/integration-testing/docker-compose.mocha.yml -f .tmp/wrp9/portal.override.yml --profile mount)
cleanup() { timeout 90 "${compose[@]}" down -v --remove-orphans --timeout 30 > ".tmp/wrp9/mocha-$backend-down.log" 2>&1 || true; }
trap cleanup EXIT
timeout 180 "${compose[@]}" up -d --wait mongodb solr keycloak email > ".tmp/wrp9/mocha-$backend-up.log" 2>&1
timeout 600 "${compose[@]}" run --rm --no-deps redboxportal-mount > ".tmp/wrp9/mocha-$backend.log" 2>&1
