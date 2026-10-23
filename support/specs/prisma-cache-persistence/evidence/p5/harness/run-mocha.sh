#!/usr/bin/env bash
set -euo pipefail
export RBPORTAL_CACHE_BACKEND="$1"
export COMPOSE_PROJECT_NAME="redbox-cache-p5-mocha-${1}-815a2a6e"
export RBPORTAL_IMAGE=redbox-cache-p4:runtime-815a2a6e
export RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/services/CacheService.test.ts\ntest/integration/services/BrandingService.test.ts\ntest/integration/services/CachePersistenceTransition.test.ts'
compose=(docker compose --profile mount -f support/integration-testing/docker-compose.mocha.yml -f .tmp/prisma-cache-p5/compose-mocha.yml)
trap '"${compose[@]}" down -v --remove-orphans --timeout 30' EXIT
mkdir -p .tmp/prisma-cache-p5/{attachments,email} .tmp/junit/backend-mocha coverage/mocha
"${compose[@]}" up --menu=false --abort-on-container-exit --exit-code-from redboxportal-mount redboxportal-mount
