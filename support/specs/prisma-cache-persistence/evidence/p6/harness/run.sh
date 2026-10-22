#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../../../.."
harness="$PWD/support/specs/prisma-cache-persistence/evidence/p6/harness"
run_dir=$(mktemp -d "$PWD/.tmp/prisma-cache-p6/rehearsal-XXXXXX")
project="redbox-cache-p6-$(basename "$run_dir" | tr '[:upper:]' '[:lower:]')"
export P6_RUN_TOKEN="$project"
compose=(docker compose -p "$project" -f "$harness/compose.yml" -f "$harness/compose-prisma.yml")
# Start without the fresh-init overlay; add it only after the legacy data exists.
legacy_compose=(docker compose -p "$project" -f "$harness/compose.yml")
cleanup() {
  docker rm -fv "${project}-old-worker" >/dev/null 2>&1 || true
  "${compose[@]}" --profile recovery down -v --remove-orphans --timeout 60
  docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.Names}}'
  docker volume ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}}'
  docker network ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}}'
}
trap cleanup EXIT
wait_mongo() {
  for attempt in {1..60}; do
    if "${compose[@]}" exec -T "$1" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then return; fi
    sleep 1
  done
  return 1
}
select_url() {
  local mapped_port
  mapped_port=$("${compose[@]}" port "$1" 27017)
  export P6_CACHE_MONGO_URL="mongodb://${mapped_port}/redbox_cache_p6"
}
old_worker() {
  docker buildx build --progress plain --target rehearsal --output type=cacheonly --network host \
    --build-context "p6harness=$harness" --build-arg "P6_CACHE_MONGO_URL=$P6_CACHE_MONGO_URL" \
    --build-arg "P6_MODE=$1" -f "$harness/Dockerfile.legacy" "$PWD/.tmp/prisma-cache-p6/legacy-source"
}
worker() { node "$harness/worker.cjs" "$@"; }
printf 'P6 project=%s results=%s\n' "$project" "$run_dir"
"${legacy_compose[@]}" up -d mongodb
wait_mongo mongodb
select_url mongodb
old_worker seed
worker snapshot "$run_dir/before7.json"
"${compose[@]}" exec -T mongodb mongodump --version
"${compose[@]}" exec -T mongodb mongodump --archive --gzip > "$run_dir/before7.archive.gz"
sha256sum "$run_dir/before7.archive.gz"

# Recover the original checkpoint into a separate 7.0 server: no downgraded data files.
"${compose[@]}" --profile recovery up -d restore7
wait_mongo restore7
"${compose[@]}" exec -T restore7 mongorestore --version
restore_started=$SECONDS
"${compose[@]}" exec -T restore7 mongorestore --archive --gzip --stopOnError < "$run_dir/before7.archive.gz"
printf "P6 pre-upgrade archive restore seconds=%s\n" "$((SECONDS-restore_started))"
select_url restore7
worker snapshot "$run_dir/restored7.json"
cmp "$run_dir/before7.json" "$run_dir/restored7.json"
old_worker old-read
echo 'PASS pre-upgrade backup restore: canonical data/options/index hashes match; old application reads restored data'

# Clean shutdown before changing binaries; the same owned source volume survives.
"${legacy_compose[@]}" stop -t 60 mongodb
export P6_MONGO_IMAGE=mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907
"${compose[@]}" up -d mongodb
wait_mongo mongodb
select_url mongodb
worker snapshot "$run_dir/upgraded8.json"
cmp "$run_dir/before7.json" "$run_dir/upgraded8.json"
old_worker old-read
"${compose[@]}" exec -T mongodb mongosh --quiet --eval '
  const fcv=db.adminCommand({getParameter:1,featureCompatibilityVersion:1});
  if(fcv.featureCompatibilityVersion.version!=="7.0") throw Error("Unexpected pre-advancement FCV");
  printjson(db.adminCommand({setFeatureCompatibilityVersion:"8.0",confirm:true}));
  printjson(db.adminCommand({getParameter:1,featureCompatibilityVersion:1}));'
worker migrate
worker ready
worker restart-read
worker snapshot "$run_dir/after8.json"
"${compose[@]}" exec -T mongodb mongodump --version
"${compose[@]}" exec -T mongodb mongodump --archive --gzip > "$run_dir/after8.archive.gz"
sha256sum "$run_dir/after8.archive.gz"

# Recover the post-cutover checkpoint on a distinct empty 8.0 volume.
"${compose[@]}" --profile recovery up -d restore8
wait_mongo restore8
restore_started=$SECONDS
"${compose[@]}" exec -T restore8 mongorestore --archive --gzip --stopOnError < "$run_dir/after8.archive.gz"
printf "P6 post-cutover archive restore seconds=%s\n" "$((SECONDS-restore_started))"
select_url restore8
worker snapshot "$run_dir/restored8.json"
cmp "$run_dir/after8.json" "$run_dir/restored8.json"
worker restart-read
worker ready
echo 'PASS post-cutover backup restore: canonical data/options/index hashes match; new Prisma application and shared clients pass'
echo 'PASS P6 rehearsal complete; no engine downgrade, cache flush, bulk rewrite or automatic cleanup'
