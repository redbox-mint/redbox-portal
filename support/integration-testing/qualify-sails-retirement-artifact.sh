#!/usr/bin/env bash
# Qualifies installed assets, persistence and the actual production executable.
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
    docker logs --tail 200 "$container" > "$task_logs/$container-tail.log" 2>&1 || true
    timeout 75 docker stop --timeout 60 "$container" >> "$task_logs/cleanup-stop.log" || task_status=1
    timeout 45 docker rm -v "$container" >> "$task_logs/cleanup-remove.log" || task_status=1
  done
  exit "$task_status"
}
trap cleanup EXIT
docker create --name sr-p7-artifact-assets --network none \
  -e SR_ARTIFACT_BUNDLED \
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
# Start the installed executable with only deployment configuration mounted.
# No source, emitted output or dependency directory is supplied by the host.
task_config=$(mktemp "$task_logs/deployment.XXXXXX.cjs")
cat > "$task_config" <<'CONFIG'
module.exports = {
  server: { hostname: '127.0.0.1', port: 18527, publicUrl: 'http://127.0.0.1:18527' },
  datastores: { mongodb: { url: 'mongodb://127.0.0.1:29611/sr_p7_artifact_portal' }, redboxStorage: { url: 'mongodb://127.0.0.1:29621/sr_p7_artifact_portal' } },
  agendaQueue: { options: { db: 'mongodb://127.0.0.1:29611/sr_p7_artifact_agenda' } },
  redboxSession: { mongoUrl: 'mongodb://127.0.0.1:29611/sr_p7_artifact_sessions', cookie: { secure: false } },
  storage: { disks: {
    staging: { driver: 'fs', config: { root: '/tmp/staging' } },
    primary: { driver: 'fs', config: { root: '/tmp/primary' } },
    'figshare-staging': { driver: 'fs', config: { root: '/tmp/figshare' } },
  } },
  bootstrap: { bootstrapDataPath: 'bootstrap-data' },
  brandingConfigurationDefaults: { auth: { active: ['local'] } },
  vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
  solr: { clientSleepTimeMillis: 0, cores: { default: { options: { host: '127.0.0.1', port: 29631, core: 'redbox' } } } },
  i18n: { next: { init: { debug: false } } },
  csp: { extras: [] },
};
CONFIG
chmod a+r "$task_config"
docker run -d --init --name sr-p7-artifact-solr --network host --memory=1024m \
  solr:10.0.0@sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b \
  bash -c 'precreate-core redbox /opt/solr/server/solr/configsets/_default && exec solr-foreground --user-managed --port 29631' > "$task_logs/solr-container.txt"
task_containers+=(sr-p7-artifact-solr)
for attempt in {1..120}; do
  if curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:29631/solr/; then break; fi
  [[ "$attempt" != 120 ]]
  sleep 1
done
portal_options=(--network host --memory=1536m --mount "type=bind,src=$task_config,dst=/deployment.cjs,readonly"
  -e REDBOX_APPLICATION_CONFIG=/deployment.cjs -e REDBOX_SESSION_SECRET=artifact-only-session-secret-at-least-32
  -e REDBOX_PORT=18527 -e REDBOX_ADMIN_PASSWORD=artifact-only-password -e REDBOX_ADMIN_TOKEN=artifact-only-token)
docker run --rm --init "${portal_options[@]}" "$task_image" node app.express.cjs --maintenance=indexes:ensure > "$task_logs/portal-index-ensure.log" 2>&1
# Exercise the shipped image's actual CMD and HEALTHCHECK.
docker create --init --name sr-p7-artifact-portal "${portal_options[@]}" \
  "$task_image" > "$task_logs/portal-container.txt"
task_containers+=(sr-p7-artifact-portal)
for label in fresh restart; do
  started=$SECONDS
  docker start sr-p7-artifact-portal > "$task_logs/portal-$label-start.log"
  for attempt in {1..180}; do
    if curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:18527/readyz; then break; fi
    [[ "$attempt" != 180 ]]
    sleep 1
  done
  printf 'startupSeconds=%s\n' "$((SECONDS-started))" > "$task_logs/portal-$label-timing.log"
  SR_ARTIFACT_ORIGIN=http://127.0.0.1:18527 node packages/redbox-core/test/qualification/installed-portal.cjs > "$task_logs/portal-$label-probe.log" 2>&1
  for attempt in {1..40}; do
    [[ "$(docker inspect sr-p7-artifact-portal --format '{{.State.Health.Status}}')" != healthy ]] || break
    [[ "$attempt" != 40 ]]
    sleep 1
  done
  docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' sr-p7-artifact-portal > "$task_logs/portal-$label-memory.log"
  started=$SECONDS
  docker stop --timeout 60 sr-p7-artifact-portal > "$task_logs/portal-$label-stop.log"
  docker inspect sr-p7-artifact-portal --format '{{json .State}}' > "$task_logs/portal-$label-stop.json"
  [[ "$(docker inspect sr-p7-artifact-portal --format '{{.State.ExitCode}}')" == 0 ]]
  docker logs sr-p7-artifact-portal > "$task_logs/portal-$label-logs.log" 2>&1
  printf 'stopSeconds=%s\n' "$((SECONDS-started))" >> "$task_logs/portal-$label-timing.log"
done
printf 'Installed assets/components and production executable startup/readiness/restart/shutdown passed.\n'
