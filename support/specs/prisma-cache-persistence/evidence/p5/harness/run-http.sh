#!/usr/bin/env bash
set -euo pipefail
export RBPORTAL_CACHE_BACKEND="$1"
export COMPOSE_PROJECT_NAME="redbox-cache-p5-http-${1}-815a2a6e"
compose=(docker compose --profile mount -f support/integration-testing/docker-compose.bruno.general.yml -f .tmp/prisma-cache-p5/compose-http.yml)
trap '"${compose[@]}" logs --no-color > ".tmp/prisma-cache-p5/http-${RBPORTAL_CACHE_BACKEND}-portal.log"; "${compose[@]}" down -v --remove-orphans --timeout 30' EXIT
mkdir -p .tmp/prisma-cache-p5/{http-email,http-attachments} .tmp/junit/backend-bruno
if [[ "${P5_HTTP_SKIP_BRUNO:-false}" == true ]]; then
  export P5_HTTP_CSRF=true P5_HTTP_APP_URL=http://localhost:1500
fi
"${compose[@]}" up -d --wait redboxportal-mount
bruno_status=0
if [[ "${P5_HTTP_SKIP_BRUNO:-false}" != true ]]; then
  "${compose[@]}" run --rm --no-deps bruno-mount || bruno_status=$?
fi
"${compose[@]}" exec -T mongodb mongosh --quiet --eval 'print(JSON.stringify({p5:"full portal Mongo connections after Bruno",connections:db.serverStatus().connections}))'

# Reuse this explicitly selected live application for the repository's A17 browser case.
export P5_HTTP_CSRF=true P5_HTTP_APP_URL=http://localhost:1500
"${compose[@]}" up -d --wait redboxportal-mount playwright-stubs
browser_status=0
portal_id=$("${compose[@]}" ps -q redboxportal-mount)
docker run --rm --network "container:${portal_id}" --entrypoint bash \
  -e PLAYWRIGHT_BASE_URL=http://localhost:1500 -e RBPORTAL_CACHE_BACKEND \
  -v "$PWD:/opt/redbox-portal" -w /opt/redbox-portal mcr.microsoft.com/playwright:v1.64.0-noble \
  -c 'echo "P5 Playwright active cache backend=$RBPORTAL_CACHE_BACKEND"; node_modules/.bin/playwright test test/playwright/apps/portal-settings.spec.ts --grep A17' || browser_status=$?
cp .tmp/junit/backend-playwright/backend-playwright.xml ".tmp/prisma-cache-p5/playwright-${RBPORTAL_CACHE_BACKEND}.xml"
exit $((bruno_status || browser_status))
