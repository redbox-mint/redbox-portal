#!/usr/bin/env bash
set -euo pipefail
docker image inspect --format '{{.Id}} {{json .Config.Labels}}' redbox-cache-p5:rollback-0cfbd62b9
docker run --rm --label redbox.task=prisma-cache-p5 --network none \
 -v "$PWD/.tmp/prisma-cache-p5/rollback-versions.cjs:/opt/redbox-portal/rollback-versions.cjs:ro" \
 -v "$PWD/.tmp/prisma-cache-p5/rollback-locks.json:/opt/redbox-portal/rollback-locks.json:ro" \
 redbox-cache-p5:rollback-0cfbd62b9 node rollback-versions.cjs
network=redbox-cache-p5-rollback-815a2a6e
container_id=''
solr_id=''
portal_name=redbox-cache-p5-rollback-portal-815a2a6e
docker network create --label redbox.task=prisma-cache-p5 "$network" >/dev/null
cleanup() { docker rm -fv "$portal_name" >/dev/null 2>&1 || true; if [[ -n "$container_id" ]]; then docker rm -fv "$container_id" >/dev/null; fi; if [[ -n "$solr_id" ]]; then docker rm -fv "$solr_id" >/dev/null; fi; docker network rm "$network" >/dev/null; }
trap cleanup EXIT
container_id=$(docker run -d --network "$network" --network-alias mongodb --label redbox.task=prisma-cache-p5 -p 127.0.0.1::27017 mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907)
for attempt in {1..30}; do if docker exec "$container_id" mongosh --quiet --eval 'quit(db.runCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then break; fi; sleep 1; done
port=$(docker port "$container_id" 27017/tcp | cut -d: -f2)
export P5_CACHE_MONGO_URL="mongodb://127.0.0.1:${port}/redbox_cache_p5_rollback"
node .tmp/prisma-cache-p5/prepare-rollback.cjs
solr_id=$(docker run -d --network "$network" --network-alias solr --label redbox.task=prisma-cache-p5 solr:latest@sha256:4316295f16175f676ac6798769f7a21729131ab555f1ba8663839dd7abd92e13 solr-precreate redbox)
# Full old entrypoint and old compiled packages/dependencies; deployment config only.
timeout 600s docker run --rm --name "$portal_name" --network "$network" --label redbox.task=prisma-cache-p5 \
 -e PORT=1500 -e NODE_ENV=development -e STARTUP_TIMING=true \
 -v "$PWD/.tmp/prisma-cache-p5/rollback-local.js:/opt/redbox-portal/config/local.js:ro" \
 -v "$PWD/.tmp/prisma-cache-p5/rollback-full.cjs:/opt/redbox-portal/rollback-full.cjs:ro" \
 -v "$PWD/.tmp/prisma-cache-p5/rollback-source/support/resources/development/bootstrap-data:/opt/redbox-portal/bootstrap-data:ro" \
 redbox-cache-p5:rollback-0cfbd62b9 node rollback-full.cjs
# Fresh completed Prisma fixtures keep time-based service evidence independent of boot duration.
node .tmp/prisma-cache-p5/prepare-rollback.cjs
docker image inspect --format '{{.Id}} {{json .Config.Labels}}' redbox-cache-p5:rollback-0cfbd62b9
docker run --rm --network "$network" -e P5_CACHE_MONGO_URL=mongodb://mongodb:27017/redbox_cache_p5_rollback -v "$PWD/packages/redbox-core/test/fixtures/cache-persistence:/opt/redbox-portal/packages/redbox-core/test/fixtures/cache-persistence:ro" redbox-cache-p5:rollback-0cfbd62b9 node packages/redbox-core/test/fixtures/cache-persistence/rollback-probe.cjs
node - <<'NODE'
const assert = require('node:assert/strict');
const {start} = require('./packages/redbox-core/test/fixtures/cache-persistence/transition-client.cjs');
(async()=>{ const w=await start('prisma');try{assert.deepEqual(await w.call('cacheGet','old-to-current'),{oldRelease:true});console.log('P5 forward read of previous-release write PASS active backend=prisma');}finally{await w.close();} })().catch(error=>{console.error(error);process.exitCode=1;});
NODE
