#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
compose_file="$repo_root/support/integration-testing/docker-compose.playwright.yml"
project="${COMPOSE_PROJECT_NAME:-redbox-playwright}"
if [[ ! "$project" =~ ^redbox-playwright(-[a-z0-9_-]+)?$ ]]; then
  echo 'Use a dedicated COMPOSE_PROJECT_NAME beginning with redbox-playwright.' >&2
  exit 2
fi
state_file=.tmp/playwright/stack.json
mode="${RBPORTAL_PLAYWRIGHT_MODE:-mount}"
action="${1:-mount}"
(($# == 0)) || shift
case "$action" in
  up|mount) mode=mount ;;
  ci|image) mode=image ;;
  run|persistent)
    action=persistent
    if [[ ! -f "$state_file" ]]; then
      echo 'No prepared Playwright stack. Run npm run test:playwright:up first.' >&2
      exit 1
    fi
    prepared_mode="$(node -e 'process.stdout.write(require("./.tmp/playwright/stack.json").mode)')"
    prepared_project="$(node -e 'process.stdout.write(require("./.tmp/playwright/stack.json").project)')"
    mode="${RBPORTAL_PLAYWRIGHT_MODE:-$prepared_mode}"
    if [[ "$mode" != "$prepared_mode" || "$project" != "$prepared_project" ]]; then
      echo 'Prepared Playwright stack mode/project differs. Clean and prepare the requested stack.' >&2
      exit 1
    fi
    ;;
  clean) ;;
  *) echo "Usage: $0 {up|mount|ci|persistent|clean} [playwright arguments...]" >&2; exit 2 ;;
esac
if [[ "$mode" != mount && "$mode" != image ]]; then
  echo "Invalid Playwright mode: $mode" >&2
  exit 2
fi
export RBPORTAL_PLAYWRIGHT_MODE="$mode"
export RBPORTAL_PLAYWRIGHT_SCENARIOS="${RBPORTAL_PLAYWRIGHT_SCENARIOS:-true}"
export COMPOSE_PROJECT_NAME="$project"
profile=mount; service=redboxportal-mount; runner=playwright-mount
if [[ "$mode" == image ]]; then profile=ci; service=redboxportal; runner=playwright; fi
compose=(docker compose --project-name "$project" -f "$compose_file" --profile "$profile")
all_profiles=(docker compose --project-name "$project" -f "$compose_file" --profile ci --profile mount)

remove_owned_data() {
  if ! rm -rf .tmp/playwright/attachments .tmp/playwright/email 2>/dev/null; then
    # Portal uploads can create root-owned subdirectories in these bind mounts.
    # Use the already available portal image to remove only disposable data.
    echo 'Removing container-owned disposable attachment and mail data.'
    docker run --rm --pull never --network none --user root --entrypoint node \
      --mount "type=bind,source=$repo_root/.tmp/playwright,target=/playwright" \
      "${RBPORTAL_IMAGE:-qcifengineering/redbox-portal:develop}" \
      -e 'const fs=require("node:fs"); for (const name of ["attachments", "email"]) fs.rmSync(`/playwright/${name}`, {recursive:true, force:true});'
  fi
  rm -f .tmp/playwright/cleanup-failed.json "$state_file" .tmp/playwright/stack-mode .tmp/playwright/build-stamp .tmp/playwright/seed-ledger.json
}
if [[ "$action" == clean ]]; then
  "${all_profiles[@]}" down -v --remove-orphans --timeout 30
  remove_owned_data
  exit 0
fi
mkdir -p .tmp/playwright/{attachments,email,logs,coverage} .tmp/junit/backend-playwright
node - "$mode" "$project" <<'NODE'
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const [mode, project] = process.argv.slice(2);
const imageReference = process.env.RBPORTAL_IMAGE || 'qcifengineering/redbox-portal:develop';
let imageId = null;
try { imageId = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', imageReference], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch { /* Startup reports an unavailable image. */ }
fs.writeFileSync('.tmp/playwright/logs/preflight-metadata.json', JSON.stringify({
  mode, project, imageReference, imageId, requestedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  sourceDirty: execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim().length > 0,
}, null, 2));
NODE
{
  node support/integration-testing/playwright-build-state.cjs manifest
  node support/integration-testing/check-playwright-coverage.cjs
} 2>&1 | tee .tmp/playwright/logs/preflight.log

collect_logs() {
  "${compose[@]}" logs --no-color > .tmp/playwright/logs/compose.log 2>&1 || true
  "${compose[@]}" logs --no-color "$service" > .tmp/playwright/logs/portal.log 2>&1 || true
  "${compose[@]}" logs --no-color playwright-stubs > .tmp/playwright/logs/stubs.log 2>&1 || true
}
keep_stack=false
setup_started=$SECONDS
finish() {
  local result=$?
  trap - EXIT INT TERM
  collect_logs
  if [[ "$keep_stack" != true ]]; then
    if "${all_profiles[@]}" down -v --remove-orphans --timeout 30; then
      remove_owned_data || { [[ "$result" != 0 ]] || result=1; }
    else
      [[ "$result" != 0 ]] || result=1
    fi
  fi
  exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "$action" == persistent ]]; then
  keep_stack=true
  if [[ -f .tmp/playwright/cleanup-failed.json ]]; then
    echo 'A previous fixture cleanup failed. Reset this stack with npm run test:playwright:clean before reuse.' >&2
    exit 1
  fi
  if [[ "$mode" == mount ]]; then node support/integration-testing/playwright-build-state.cjs check; fi
  container_id="$("${compose[@]}" ps -q "$service")"
  if [[ -z "$container_id" || "$(docker inspect --format '{{.State.Health.Status}}' "$container_id")" != healthy ]]; then
    echo 'Prepared portal is not healthy. Run npm run test:playwright:up.' >&2
    exit 1
  fi
else
  if [[ "$action" != up ]]; then
    "${all_profiles[@]}" down -v --remove-orphans --timeout 30
    remove_owned_data
    mkdir -p .tmp/playwright/{attachments,email}
  fi
  # Force preparation when up is requested, even if the container configuration is unchanged.
  "${compose[@]}" up -d --force-recreate --wait "$service" 2>&1 | tee .tmp/playwright/logs/compose-up.log
  container_id="$("${compose[@]}" ps -q "$service")"
fi
image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
revision="$(git rev-parse HEAD)"
portal_node_version="$("${compose[@]}" exec -T "$service" node --version)"
node - "$mode" "$project" "$image_id" "$revision" "$portal_node_version" "$((SECONDS - setup_started))" <<'NODE'
const fs = require('node:fs');
const [mode, project, imageId, revision, portalNodeVersion, setupSeconds] = process.argv.slice(2);
const state = { mode, project, imageId, revision, portalNodeVersion, setupDurationMs: Number(setupSeconds) * 1000,
  baseURL: `http://localhost:${process.env.RBPORTAL_PLAYWRIGHT_PORT || 1500}`,
  stubURL: `http://localhost:${process.env.RBPORTAL_PLAYWRIGHT_STUB_PORT || 8787}`,
  browserStubURL: `http://playwright-stubs:${process.env.RBPORTAL_PLAYWRIGHT_STUB_PORT || 8787}`,
  scenariosEnabled: process.env.RBPORTAL_PLAYWRIGHT_SCENARIOS === 'true', observedAt: new Date().toISOString() };
fs.writeFileSync('.tmp/playwright/stack.json', JSON.stringify(state, null, 2));
// The container runner may have replaced this file as root on the previous
// run. Replace it through the writable log directory instead of opening it.
const metadataPath = '.tmp/playwright/logs/run-metadata.json';
const temporaryPath = `${metadataPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2));
fs.renameSync(temporaryPath, metadataPath);
NODE
if [[ "$action" == up ]]; then
  if [[ "${1:-}" == --detach ]]; then shift; fi
  if (($#)); then echo 'up does not accept test arguments; use test:playwright:run.' >&2; exit 2; fi
  keep_stack=true
  printf 'Playwright stack ready: http://localhost:%s (mode=%s, project=%s)\n' "${RBPORTAL_PLAYWRIGHT_PORT:-1500}" "$mode" "$project"
  printf 'Inspect provider requests with: docker compose -p %s -f %s exec playwright-stubs node -e '\''fetch("http://localhost:8787/control/requests").then(r=>r.text()).then(console.log)'\''\n' "$project" "$compose_file"
  exit 0
fi
"${compose[@]}" run --rm --no-deps "$runner" "$@"
