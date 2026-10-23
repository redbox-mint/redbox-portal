#!/usr/bin/env bash
set -euo pipefail
container="${PERSISTENCE_TEST_DOCKER_PREFIX:-redbox-prisma-tests}-${$}"
if [[ -z "${PERSISTENCE_TEST_MONGO_URL:-}" ]]; then
  trap 'timeout 60 docker rm -fv "$container" >/dev/null 2>&1 || true' EXIT
  timeout 90 docker run -d --name "$container" --memory=1536m -p 127.0.0.1::27017 mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8 --bind_ip_all --wiredTigerCacheSizeGB 0.25 >/dev/null
  for attempt in {1..40}; do
    if timeout 10 docker exec "$container" mongosh --quiet --eval 'quit(db.runCommand({ping:1}).ok?0:1)' >/dev/null 2>&1; then break; fi
    if [[ "$attempt" == 40 ]]; then exit 1; fi
    sleep 1
  done
  port=$(docker port "$container" 27017/tcp | cut -d: -f2)
  export PERSISTENCE_TEST_MONGO_URL="mongodb://127.0.0.1:${port}/redbox_prisma_test"
fi
timeout 240s npm test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts test/integration/PrismaPersistence.test.ts
