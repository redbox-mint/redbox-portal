#!/usr/bin/env bash
set -euo pipefail
source .tmp/tx-parity-phase0/env.sh
compose=(docker compose -p wrp9-815a2a6e -f .tmp/wrp9/mongo.yml)
timeout 180 "${compose[@]}" up -d --wait
export B_MONGO_URL="mongodb://$("${compose[@]}" port mongodb 27017)/wr_p9_branding"
export B_STORAGE_URL="mongodb://$("${compose[@]}" port mongodb 27017)/wr_p9_history"
timeout 90 node .tmp/wrp9/spike.cjs > .tmp/wrp9/spike-one-server.json
export B_STORAGE_URL="mongodb://$("${compose[@]}" port history 27017)/wr_p9_history"
timeout 90 node .tmp/wrp9/spike.cjs > .tmp/wrp9/spike-separate-servers.json
