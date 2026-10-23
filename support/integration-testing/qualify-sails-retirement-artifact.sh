#!/usr/bin/env bash
# Qualifies installed components/assets, not the missing full Express portal.
set -euo pipefail
cd "$(dirname "$0")/../.."
node --eval 'require("node:assert/strict").equal(process.version, "v26.11.1")'
task_image=${SR_P7_IMAGE:?Set the immutable local image ID to qualify}
[[ "$task_image" =~ ^sha256:[a-f0-9]{64}$ ]]
task_logs="${SR_P7_ARTIFACT_LOGS:-$PWD/.tmp/sails-retirement/p7/artifact-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$task_logs"
docker image inspect "$task_image" > "$task_logs/image-inspect.json"
task_containers=()
cleanup() {
  task_status=$?
  for ((task_index=${#task_containers[@]}-1;task_index>=0;task_index--)); do
    container=${task_containers[$task_index]}
    timeout 75 docker stop --timeout 60 "$container" >> "$task_logs/cleanup-stop.log" || task_status=1
    timeout 45 docker rm -v "$container" >> "$task_logs/cleanup-remove.log" || task_status=1
  done
  exit "$task_status"
}
trap cleanup EXIT
docker create --name sr-p7-artifact-assets --network none \
  --mount "type=bind,src=$PWD/packages/redbox-core/test/qualification/image-artifacts.cjs,dst=/opt/redbox-portal/image-artifacts.cjs,readonly" \
  "$task_image" node --test image-artifacts.cjs > "$task_logs/assets-container.txt"
task_containers+=(sr-p7-artifact-assets)
docker start -a sr-p7-artifact-assets > "$task_logs/assets.log" 2>&1
[[ "$(docker inspect --format '{{.State.ExitCode}}' sr-p7-artifact-assets)" == 0 ]]
task_mongo=mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907
for placement in core storage; do
  port=29611
  if [[ "$placement" == storage ]]; then port=29621; fi
  name="sr-p7-artifact-$placement"
  docker run -d --init --name "$name" --network host --memory=768m --ulimit nofile=64000:64000 \
    "$task_mongo" --port "$port" --bind_ip 127.0.0.1 --wiredTigerCacheSizeGB 0.25 > "$task_logs/$placement-container.txt"
  task_containers+=("$name")
  node packages/redbox-core/test/qualification/matrix-topology.cjs sr-core "$port" > "$task_logs/$placement-ready.log" 2>&1
done
# Only the verifier is mounted. Its relative imports resolve emitted libraries
# inside the image; no application source/dist/node_modules mount is supplied.
docker create --name sr-p7-artifact-components --network host \
  --mount "type=bind,src=$PWD/packages/redbox-core/test/qualification/database-matrix.cjs,dst=/opt/redbox-portal/packages/redbox-core/test/qualification/database-matrix.cjs,readonly" \
  -e SR_MATRIX_CORE_URL=mongodb://127.0.0.1:29611/sr_p7_matrix \
  -e SR_MATRIX_STORAGE_URL=mongodb://127.0.0.1:29621/sr_p7_matrix \
  -e SR_MATRIX_VERSION=8.0.34 -e SR_MATRIX_FCV=8.0 -e SR_MATRIX_REPLICA=false \
  "$task_image" node --test packages/redbox-core/test/qualification/database-matrix.cjs > "$task_logs/components-container.txt"
task_containers+=(sr-p7-artifact-components)
docker start -a sr-p7-artifact-components > "$task_logs/components.log" 2>&1
[[ "$(docker inspect --format '{{.State.ExitCode}}' sr-p7-artifact-components)" == 0 ]]
printf 'Installed component/asset checks passed; full production Express portal remains unqualified.\n'
