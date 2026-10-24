#!/usr/bin/env bash
# Destructive only to this script's new, guarded disposable rehearsal resources.
# Exercises released-v5, installed v6 cutover/restart/stop and complete recovery.
set -euo pipefail
cd "$(dirname "$0")/../.."
task_root=$PWD
node --eval 'require("node:assert/strict").equal(process.version, "v26.11.1")'
task_state=$(mktemp -d "${SR_P7_SCRATCH_ROOT:?Set a writable scratch directory with at least 6 GiB free}/sr-p7-recovery.XXXXXX")
task_logs="${SR_P7_RECOVERY_LOGS:-$task_root/.tmp/sails-retirement/p7/recovery-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$task_logs" "$task_state/state/attachments/primary" "$task_state/state/attachments/staging" "$task_state/state/configuration" "$task_state/checkpoint" "$task_state/tools"
printf '%s\n' "$task_state" > "$task_logs/scratch-path.txt"
task_image=qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9
task_mongo=mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907
task_candidate=${SR_P7_CANDIDATE_IMAGE:?Set the qualified immutable local candidate image ID (with bundled hooks)}
[[ "$task_candidate" =~ ^sha256:[a-f0-9]{64}$ ]]
docker image inspect "$task_candidate" --format '{{.Id}} {{json .RepoDigests}}' > "$task_logs/candidate-image.txt"
task_network=${SR_P7_RECOVERY_NETWORK:-sr-p7-upgrade}
task_owns_network=false
task_containers=()
if [[ -n "${SR_P7_RECOVERY_NETWORK:-}" ]]; then
  docker network inspect "$task_network" > "$task_logs/network-inspect.json"
else
  docker network create "$task_network" >/dev/null
  task_owns_network=true
fi
cleanup() {
  task_status=$?
  # Stop the portal before its dependencies, including on a failed probe.
  for ((task_index=${#task_containers[@]}-1;task_index>=0;task_index--)); do
    container=${task_containers[$task_index]}
    docker logs --tail 200 "$container" > "$task_logs/$container-tail.log" 2>&1 || true
    timeout 75 docker stop --timeout 60 "$container" >/dev/null || task_status=1
    timeout 45 docker rm -v "$container" >/dev/null || task_status=1
  done
  if [[ "$task_owns_network" == true ]]; then
    timeout 45 docker network rm "$task_network" >/dev/null || task_status=1
  fi
  exit "$task_status"
}
trap cleanup EXIT
for placement in core storage; do
  port=28031
  alias=mongodb
  if [[ "$placement" == storage ]]; then port=28032; alias=storage-mongodb; fi
  name="sr-p7-upgrade-$placement"
  docker run -d --init --name "$name" --network "$task_network" --network-alias "$alias" \
    -p "127.0.0.1:$port:27017" --memory=768m --ulimit nofile=64000:64000 \
    "$task_mongo" --bind_ip_all --wiredTigerCacheSizeGB 0.25 >/dev/null
  task_containers+=("$name")
  node packages/redbox-core/test/qualification/matrix-topology.cjs sr-core "$port"
done
export SR_REHEARSAL_DISPOSABLE=true
export SR_REHEARSAL_CORE_URL=mongodb://127.0.0.1:28031/redbox-portal
export SR_REHEARSAL_STORAGE_URL=mongodb://127.0.0.1:28032/redbox-storage
fixture() { node packages/redbox-core/test/qualification/recovery-fixture.cjs "$@"; }
fixture seed support/specs/sails-retirement/evidence/released-v5-upgrade-fixture.json > "$task_logs/seed.log" 2>&1
docker run -d --init --name sr-p7-upgrade-solr --network "$task_network" --network-alias solr --memory=1024m \
  solr:10.0.0@sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b \
  solr-precreate redbox /opt/solr/server/solr/configsets/_default >/dev/null
task_containers+=(sr-p7-upgrade-solr)
cat > "$task_state/state/configuration/local.cjs" <<'CONFIG'
module.exports = {
  datastores: { mongodb: { url: 'mongodb://mongodb/redbox-portal' }, redboxStorage: { url: 'mongodb://storage-mongodb/redbox-storage' } },
  brandingConfigurationDefaults: { auth: { active: ['local'] } },
  vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
  crontab: { enabled: false }, log: { level: 'info' },
};
CONFIG
printf 'checkpoint primary bytes\n' > "$task_state/state/attachments/primary/checkpoint.txt"
printf 'checkpoint staging bytes\n' > "$task_state/state/attachments/staging/checkpoint.part"
chmod -R a+rwX "$task_state/state"
start_v5() {
  local state=$1 label=$2
  local started=$SECONDS
  docker run -d --init --name sr-p7-upgrade-v5 --network "$task_network" -p 127.0.0.1:18507:1500 --memory=1536m \
    -v "$state/configuration/local.cjs:/opt/redbox-portal/config/local.js:ro" -v "$state/attachments:/attachments" \
    -e NODE_ENV=integrationtest -e PORT=1500 -e LOAD_DEFAULT_FORMS=true -e STARTUP_TIMING=true \
    -e sails_security__csrf=false -e sails_brandingConfigurationDefaults__auth__local__default__token=d077835a-696b-4728-85cf-3ffd57152b1e \
    "$task_image" >/dev/null
  # The same name is reused after source removal and recovery.
  if [[ " ${task_containers[*]} " != *" sr-p7-upgrade-v5 "* ]]; then
    task_containers+=(sr-p7-upgrade-v5)
  fi
  for attempt in {1..600}; do
    if curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:18507/default/rdmp/home 2>/dev/null; then break; fi
    if [[ "$attempt" == 600 ]]; then docker logs sr-p7-upgrade-v5 > "$task_logs/$label-portal.log" 2>&1; return 1; fi
    sleep 1
  done
  printf '%s startupSeconds=%s\n' "$label" "$((SECONDS-started))" > "$task_logs/$label-timing.log"
  if ! fixture probe > "$task_logs/$label-probe.log" 2>&1; then
    docker logs sr-p7-upgrade-v5 > "$task_logs/$label-portal.log" 2>&1
    return 1
  fi
  docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' sr-p7-upgrade-v5 > "$task_logs/$label-memory.log"
}
stop_v5() {
  local label=$1 started=$SECONDS
  timeout 75 docker stop --timeout 60 sr-p7-upgrade-v5 >/dev/null
  docker inspect sr-p7-upgrade-v5 --format '{{json .State}}' > "$task_logs/$label-stop.json"
  docker logs sr-p7-upgrade-v5 > "$task_logs/$label-portal.log" 2>&1
  printf '%s stopSeconds=%s\n' "$label" "$((SECONDS-started))" >> "$task_logs/$label-timing.log"
}
start_v5 "$task_state/state" source
stop_v5 source
docker cp sr-p7-upgrade-v5:/opt/redbox-portal/config "$task_state/checkpoint/runtime-config"
docker rm -v sr-p7-upgrade-v5 >/dev/null
# The removed source portal was the last registered container. A later failure
# before recovered startup must not attempt to stop a nonexistent resource.
unset 'task_containers[-1]'
# All application writers are now stopped. The two standalone dumps share this
# quiescent checkpoint; they are not claimed as an online cross-server snapshot.
docker cp sr-p7-upgrade-core:/usr/bin/mongodump "$task_state/tools/mongodump"
docker cp sr-p7-upgrade-core:/usr/bin/mongorestore "$task_state/tools/mongorestore"
"$task_state/tools/mongodump" --version > "$task_logs/tools-version.log"
"$task_state/tools/mongodump" --uri "$SR_REHEARSAL_CORE_URL" --archive="$task_state/checkpoint/core.archive" > "$task_logs/core-dump.log" 2>&1
"$task_state/tools/mongodump" --uri "$SR_REHEARSAL_STORAGE_URL" --archive="$task_state/checkpoint/storage.archive" > "$task_logs/storage-dump.log" 2>&1
fixture snapshot "$task_state/checkpoint/database-manifest.json" > "$task_logs/checkpoint.log" 2>&1
tar -C "$task_state/state" -cpf "$task_state/checkpoint/files.tar" attachments configuration
docker image save --platform linux/amd64 -o "$task_state/checkpoint/released-image.tar" "$task_image"
# A cached OCI index can reload while omitting the configuration/layer payload.
# Check the actual archive rather than relying on the current engine's cache.
node packages/redbox-core/test/qualification/image-backup.cjs "$task_state/checkpoint/released-image.tar" > "$task_logs/image-backup-payload.json"
docker image inspect "$task_image" --format '{{.Id}} {{json .RepoDigests}}' > "$task_logs/released-image.txt"
cat > "$task_state/deployment.cjs" <<CONFIG
module.exports = { datastores: { mongodb: { url: '$SR_REHEARSAL_CORE_URL' }, redboxStorage: { url: '$SR_REHEARSAL_STORAGE_URL' } }, agendaQueue: { options: { db: '$SR_REHEARSAL_CORE_URL', collection: 'agendaJobs' } } };
CONFIG
set +e
node packages/redbox-core/bin/persistence-indexes.cjs --config "$task_state/deployment.cjs" > "$task_logs/index-before.json" 2> "$task_logs/index-before-error.log"
task_inspect=$?
set -e
[[ "$task_inspect" == 0 || "$task_inspect" == 2 ]]
# The released fixture has one reviewed nonunique redboxOid_1 index. Verify its
# exact definition and zero duplicates before this separate operator action;
# maintenance itself continues to refuse conflicting definitions without DDL.
fixture review-source-index "$task_logs/index-before.json" > "$task_logs/review-source-index.log" 2>&1
node packages/redbox-core/bin/persistence-indexes.cjs --ensure --config "$task_state/deployment.cjs" > "$task_logs/index-ensure.json" 2> "$task_logs/index-ensure-error.log"
node packages/redbox-core/bin/persistence-indexes.cjs --inspect --config "$task_state/deployment.cjs" > "$task_logs/index-after.json" 2> "$task_logs/index-after-error.log"
# Run the same installed candidate commands as the operator procedure. Each
# maintenance process exits before the next starts; the sole portal owns signals.
cat > "$task_state/state/configuration/v6.cjs" <<'CONFIG'
module.exports = {
  server: { hostname: '0.0.0.0', port: 1500, publicUrl: 'http://127.0.0.1:18508' },
  datastores: { mongodb: { url: 'mongodb://mongodb/redbox-portal' }, redboxStorage: { url: 'mongodb://storage-mongodb/redbox-storage' } },
  agendaQueue: { options: { db: 'mongodb://mongodb/redbox-portal', collection: 'agendaJobs' } },
  redboxSession: { name: 'redbox.v6.sid', mongoUrl: 'mongodb://mongodb/redbox-portal', collection: 'sessions_v6', cookie: { secure: false } },
  storage: { disks: {
    primary: { driver: 'fs', config: { root: '/attachments/primary' } },
    staging: { driver: 'fs', config: { root: '/attachments/staging' } },
    'figshare-staging': { driver: 'fs', config: { root: '/attachments/figshare' } },
  } },
  bootstrap: { bootstrapDataPath: 'bootstrap-data' },
  brandingConfigurationDefaults: { auth: { active: ['local'] } },
  vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
  solr: { clientSleepTimeMillis: 0, cores: { default: { options: { host: 'solr', port: 8983, core: 'redbox' } } } },
  i18n: { next: { init: { debug: false } } },
  csp: { extras: [] },
  // Reviewed synthetic fixture decision: preserve the standard existing-location
  // dashboard's cells/actions instead of the old workspace page's empty values.
  // The migration refuses a different input fingerprint or finding ID.
  dashboardMigrationResolutions: {
    captureFingerprints: { default: '4439b700369c53470342b7a6f3ae1ee3884708931211121ea25ba5279a62539a' },
    acceptedFindingIdsByBrand: { default: ['170fbfa0478ae963'] },
    replacements: [],
  },
};
CONFIG
candidate_options=(--network "$task_network" --memory=1536m
  -v "$task_state/state/configuration/v6.cjs:/deployment.cjs:ro"
  -v "$task_state/state/attachments:/attachments"
  -e NODE_ENV=production -e REDBOX_APPLICATION_CONFIG=/deployment.cjs
  -e REDBOX_SESSION_SECRET=rehearsal-only-session-secret-at-least-32)
for operation in --maintenance=indexes:ensure --maintenance=indexes:inspect --initialize-only; do
  label=${operation//[^a-zA-Z0-9]/-}
  docker run --rm --init "${candidate_options[@]}" "$task_candidate" node app.express.cjs "$operation" > "$task_logs/candidate$label.log" 2>&1
done
for label in candidate candidate-restarted; do
  task_started=$SECONDS
  docker run -d --init --name sr-p7-upgrade-v6 -p 127.0.0.1:18508:1500 "${candidate_options[@]}" "$task_candidate" node app.express.cjs > "$task_logs/$label-container.txt"
  task_containers+=(sr-p7-upgrade-v6)
  for attempt in {1..180}; do
    if curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:18508/readyz 2>/dev/null; then break; fi
    if [[ "$attempt" == 180 ]]; then docker logs sr-p7-upgrade-v6 > "$task_logs/$label-portal.log" 2>&1; exit 1; fi
    sleep 1
  done
  printf '%s startupSeconds=%s\n' "$label" "$((SECONDS-task_started))" > "$task_logs/$label-timing.log"
  fixture probe-v6 > "$task_logs/$label-probe.log" 2>&1
  docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' sr-p7-upgrade-v6 > "$task_logs/$label-memory.log"
  task_started=$SECONDS
  timeout 75 docker stop --timeout 60 sr-p7-upgrade-v6 > "$task_logs/$label-stop.log"
  [[ "$(docker inspect sr-p7-upgrade-v6 --format '{{.State.ExitCode}}')" == 0 ]]
  docker inspect sr-p7-upgrade-v6 --format '{{json .State}}' > "$task_logs/$label-stop.json"
  docker logs sr-p7-upgrade-v6 > "$task_logs/$label-portal.log" 2>&1
  printf '%s stopSeconds=%s\n' "$label" "$((SECONDS-task_started))" >> "$task_logs/$label-timing.log"
  docker rm -v sr-p7-upgrade-v6 >/dev/null
  unset 'task_containers[-1]'
done
# Exercise migration retry/failure using the installed candidate's emitted
# modules and production dependencies. Only the guarded verifier is mounted.
docker run --rm --init --network host --memory=1536m \
  --mount "type=bind,src=$task_root/packages/redbox-core/test/qualification/recovery-fixture.cjs,dst=/opt/redbox-portal/packages/redbox-core/test/qualification/recovery-fixture.cjs,readonly" \
  -e SR_REHEARSAL_DISPOSABLE -e SR_REHEARSAL_CORE_URL -e SR_REHEARSAL_STORAGE_URL \
  "$task_candidate" node packages/redbox-core/test/qualification/recovery-fixture.cjs upgrade-components > "$task_logs/upgrade-components.log" 2>&1
# Emulate an interrupted cutover affecting databases, bytes and config. Never run
# the old image over this changed state: restore the complete checkpoint first.
fixture destroy-disposable > "$task_logs/destroy.log" 2>&1
printf 'damaged\n' > "$task_state/state/attachments/primary/checkpoint.txt"
rm "$task_state/state/attachments/staging/checkpoint.part" "$task_state/state/configuration/local.cjs"
"$task_state/tools/mongorestore" --uri "$SR_REHEARSAL_CORE_URL" --drop --archive="$task_state/checkpoint/core.archive" > "$task_logs/core-restore.log" 2>&1
"$task_state/tools/mongorestore" --uri "$SR_REHEARSAL_STORAGE_URL" --drop --archive="$task_state/checkpoint/storage.archive" > "$task_logs/storage-restore.log" 2>&1
mkdir "$task_state/restored"
tar -C "$task_state/restored" -xpf "$task_state/checkpoint/files.tar"
cmp "$task_state/restored/attachments/primary/checkpoint.txt" <(printf 'checkpoint primary bytes\n')
cmp "$task_state/restored/attachments/staging/checkpoint.part" <(printf 'checkpoint staging bytes\n')
cmp "$task_state/restored/configuration/local.cjs" "$task_state/checkpoint/runtime-config/local.js"
docker image load -i "$task_state/checkpoint/released-image.tar" > "$task_logs/image-load.log"
fixture verify "$task_state/checkpoint/database-manifest.json" > "$task_logs/restore-verification.log" 2>&1
start_v5 "$task_state/restored" recovered
stop_v5 recovered
printf 'Installed v6 cutover/restart/stop and released-v5 complete checkpoint recovery passed. Institution designation remains external.\n'
