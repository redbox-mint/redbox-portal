#!/usr/bin/env bash
set -euo pipefail
container_id=''
trap 'if [[ -n "$container_id" ]]; then docker rm -fv "$container_id" >/dev/null; fi' EXIT
container_id=$(docker run -d --label redbox.task=prisma-cache-p5 -p 127.0.0.1::27017 mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907)
for attempt in {1..30}; do if docker exec "$container_id" mongosh --quiet --eval 'quit(db.runCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then break; fi; sleep 1; done
port=$(docker port "$container_id" 27017/tcp | cut -d: -f2)
export P5_CACHE_MONGO_URL="mongodb://127.0.0.1:${port}/redbox_cache_p5_observer"
node .tmp/prisma-cache-p5/observer-control.cjs
