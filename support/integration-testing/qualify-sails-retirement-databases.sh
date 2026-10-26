#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
task_root=$PWD
task_logs="${SR_P7_DATABASE_LOGS:-$task_root/.tmp/sails-retirement/p7/database-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$task_logs"
task_run="${SR_P7_DATABASE_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ "$task_run" =~ ^[a-zA-Z0-9-]+$ ]]
node --eval 'require("node:assert/strict").equal(process.version, "v26.11.1")'
task_containers=()
cleanup() {
  task_status=$?
  if ((${#task_containers[@]})); then
    for task_container in "${task_containers[@]}"; do
      docker logs --tail 200 "$task_container" > "$task_logs/$task_container-tail.log" 2>&1 || true
    done
    timeout 90 docker stop --timeout 30 "${task_containers[@]}" > "$task_logs/container-stop.log" 2>&1 || task_status=1
    timeout 600 docker rm -f -v "${task_containers[@]}" > "$task_logs/container-remove.log" 2>&1 || task_status=1
  fi
  exit "$task_status"
}
trap cleanup EXIT
row=0
for major in 8 9; do
  if [[ "$major" == 8 ]]; then
    image=mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907
    version=8.0.34
    fcv=8.0
  else
    image=mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8
    version=9.0.4
    fcv=9.0
  fi
  for topology in standalone replica; do
    row=$((row+1))
    row_containers=()
    count=1
    replica=false
    if [[ "$topology" == replica ]]; then count=3; replica=true; fi
    for placement in core storage; do
      ports=()
      for ((member=1;member<=count;member++)); do
        name="sr-p7-${task_run}-${major}-${topology}-${placement}${member}"
        port="29${row}1${member}"
        if [[ "$placement" == storage ]]; then port="29${row}2${member}"; fi
        ports+=("$port")
        arguments=(--bind_ip 127.0.0.1 --port "$port" --wiredTigerCacheSizeGB 0.25)
        if [[ "$replica" == true ]]; then arguments+=(--replSet "sr-${placement}"); fi
        timeout 120 docker run -d --init --name "$name" --network host --memory=768m \
          --ulimit nofile=64000:64000 "$image" "${arguments[@]}" >/dev/null
        task_containers+=("$name")
        row_containers+=("$name")
      done
      node packages/redbox-core/test/qualification/matrix-topology.cjs "sr-$placement" "${ports[@]}" \
        > "$task_logs/${major}-${topology}-${placement}-init.log" 2>&1
    done
    task_core="mongodb://127.0.0.1:29${row}11/sr_p7_matrix"
    task_storage="mongodb://127.0.0.1:29${row}21/sr_p7_matrix"
    if [[ "$replica" == true ]]; then
      task_core+='?replicaSet=sr-core&serverSelectionTimeoutMS=30000&retryWrites=true'
      task_storage+='?replicaSet=sr-storage&serverSelectionTimeoutMS=30000&retryWrites=true'
    fi
    docker inspect "${row_containers[@]}" --format '{{.Name}} image={{.Image}} ulimits={{json .HostConfig.Ulimits}} command={{json .Config.Cmd}}' > "$task_logs/${major}-${topology}-containers.log"
    SR_MATRIX_CORE_URL="$task_core" SR_MATRIX_STORAGE_URL="$task_storage" \
      SR_MATRIX_VERSION="$version" SR_MATRIX_FCV="$fcv" SR_MATRIX_REPLICA="$replica" \
      timeout 240 node --test packages/redbox-core/test/qualification/database-matrix.cjs > "$task_logs/${major}-${topology}.log" 2>&1
    tail -15 "$task_logs/${major}-${topology}.log"
    if [[ "${SR_P7_PRODUCTION_PORTAL:-false}" == true ]]; then
      SR_PORTAL_MONGO_URL="${task_core/sr_p7_matrix/sr_p7_portal_http}" \
      SR_PORTAL_STORAGE_URL="${task_storage/sr_p7_matrix/sr_p7_portal_http}" \
      SR_PORTAL_SOLR_PORT="${SR_PORTAL_SOLR_PORT:?production portal requires a running Solr}" \
      SR_MATRIX_VERSION="$version" SR_MATRIX_FCV="$fcv" SR_MATRIX_REPLICA="$replica" \
        timeout 240 node --test --test-force-exit packages/redbox-core/test/qualification/portal-host.cjs \
        > "$task_logs/${major}-${topology}-production-portal.log" 2>&1
      tail -15 "$task_logs/${major}-${topology}-production-portal.log"
    fi
    PERSISTENCE_TEST_MONGO_URL="${task_core/sr_p7_matrix/redbox_prisma_p7}" \
      RECORD_TYPES_TEST_MONGO_URL="${task_core/sr_p7_matrix/sr_p1_recordtypes}" \
      LIFECYCLE_TEST_MONGO_URL="${task_core/sr_p7_matrix/sr_p3_lifecycle}" \
      timeout 300 bash -eu -c '
        cd packages/redbox-core
        npm run test:persistence
        npm run test:record-types:mongo
        npm run test:lifecycle:mongo
      ' > "$task_logs/${major}-${topology}-regression.log" 2>&1
    tail -8 "$task_logs/${major}-${topology}-regression.log"
    # Keep both three-member datastores live throughout the row, then stop
    # them to release RAM. Defer snapshot/volume removal until every row has run:
    # containerd reclamation can walk large shared image layers and block another
    # row's startup. This changes no application assertion or deadline.
    timeout 90 docker stop --timeout 30 "${row_containers[@]}" > "$task_logs/${major}-${topology}-stop.log" 2>&1

  done
done
