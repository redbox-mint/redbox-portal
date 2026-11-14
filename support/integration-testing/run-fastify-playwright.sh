#!/usr/bin/env bash
set -euo pipefail

# Host-side runner for the prepared tested-image stack. Inspect logs from its
# current healthy container, rather than trusting the requested selector.
cd "$(dirname "$0")/../.."
: "${PLAYWRIGHT_BASE_URL:?Set the published Tailscale portal URL}"
: "${REDBOX_PORTAL_APP_URL:?Set the same published Tailscale portal URL}"
[[ "$PLAYWRIGHT_BASE_URL" == "$REDBOX_PORTAL_APP_URL" ]]
export RBPORTAL_PLAYWRIGHT_HOST="${RBPORTAL_PLAYWRIGHT_HOST-fastify}"
node support/integration-testing/playwright-host.cjs
project="${COMPOSE_PROJECT_NAME:-redbox-playwright-fm032}"
[[ "$project" =~ ^redbox-playwright(-[a-z0-9_-]+)?$ ]]
compose=(docker compose -p "$project"
  -f support/integration-testing/docker-compose.playwright.yml
  -f support/integration-testing/docker-compose.fastify-browser.yml --profile ci)
container="$("${compose[@]}" ps -q redboxportal)"
[[ -n "$container" ]]
[[ "$(docker inspect --format '{{.State.Running}} {{.State.Health.Status}}' "$container")" == 'true healthy' ]]
rm -f .tmp/playwright/logs/observed-host.json
docker logs "$container" 2>&1 | node support/integration-testing/playwright-host.cjs --assert-started

node support/integration-testing/check-playwright-coverage.cjs
if (($# == 0)); then
  # CI's runner does not inherit the portal-only mode. The lifecycle probes
  # select their own mount/image modes and must receive that same environment.
  env -u RBPORTAL_PLAYWRIGHT_MODE node --test test/playwright-harness/*.test.cjs
  export PLAYWRIGHT_REQUIRE_COMPLETE=true
fi
exec node_modules/.bin/playwright test "$@" --retries=0
