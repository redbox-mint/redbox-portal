#!/usr/bin/env bash
set -euo pipefail

# Automatic branch publishing only. Tag and manual releases use the existing scripts.
is_release_branch() {
  [[ "${CIRCLE_BRANCH:-}" =~ ^(master|develop|support/.*)$ ]]
}

action="${1:?expected build, stage-tested, promote, manifest, or can-promote}"
if [[ "$action" == can-promote ]]; then
  is_release_branch
  exit $?
fi

variant="${2:?expected runtime or pdfgen}"
arch="${3:-}"
case "$variant" in
  runtime) suffix='' ;;
  pdfgen) suffix='-pdfgen' ;;
  *) echo "Unsupported variant: $variant" >&2; exit 1 ;;
esac
case "$action" in
  build|stage-tested|promote)
    [[ "$arch" == amd64 || "$arch" == arm64 ]] || { echo 'Expected amd64 or arm64' >&2; exit 1; }
    ;;
  manifest) ;;
  *) echo "Unsupported action: $action" >&2; exit 1 ;;
esac

[[ "${CIRCLE_SHA1:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'CIRCLE_SHA1 must be a full commit SHA' >&2; exit 1; }
# A pipeline ID prevents different pipelines for the same SHA from sharing staging tags.
# Producer job numbers additionally isolate overlapping rerun attempts.
[[ "${STAGING_RUN_ID:-}" =~ ^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$ ]] || { echo 'STAGING_RUN_ID must be the pipeline UUID' >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

staging_image() {
  printf '%s:ci-staging-%s-%s-%s-%s' "$REPO" "$CIRCLE_SHA1" "$variant" "$1" "$STAGING_RUN_ID-$CIRCLE_BUILD_NUM"
}

login() {
  echo "${DOCKER_PASS:?}" | docker login --username "${DOCKER_USER:?}" --password-stdin
}

print_command() {
  printf '%q ' "$@"
  printf '\n'
}

if [[ "$action" == stage-tested ]]; then
  [[ "$variant/$arch" == runtime/amd64 ]] || { echo 'Only runtime/amd64 can stage the tested image' >&2; exit 1; }
elif [[ "$action" == build && "$variant/$arch" == runtime/amd64 ]]; then
  echo 'Use stage-tested for runtime/amd64; rebuilding would publish an untested image' >&2
  exit 1
fi

if [[ "$action" == build || "$action" == stage-tested ]] &&
    [[ -z "${DOCKER_USER:-}" || -z "${DOCKER_PASS:-}" ]]; then
  if is_release_branch; then
    echo 'DOCKER_USER/DOCKER_PASS are required to stage images on release branches' >&2
    exit 1
  fi
  echo 'Skipping staging image push: DOCKER_USER/DOCKER_PASS unavailable; build and tests can continue'
  mkdir -p "${TMPDIR:-/tmp}/ci-staging-status"
  printf '%s\n%s\ncredential-skipped\n' "$CIRCLE_SHA1" "$STAGING_RUN_ID" >"${TMPDIR:-/tmp}/ci-staging-status/$variant-$arch"
  exit 0
fi

# Capture quota failures without hiding other failures. Each producer contributes
# a distinct marker artifact, so later dry runs can distinguish skipped
# quota-limited staging from an unexpectedly missing image. Real releases never
# accept these markers as a substitute for registry/identity verification.
if [[ "${CI_STAGING_QUOTA_GUARD:-}" != 1 ]]; then
  log="$(mktemp)"
  set +e
  CI_STAGING_QUOTA_GUARD=1 bash "$0" "$@" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  set -e
  state=verified
  if ((status != 0)) && ! is_release_branch &&
      tail -n 1 "$log" | grep -Eqi 'toomanyrequests|too many requests|pull (rate |quota|limit)|HTTP 429|429 Too Many Requests'; then
    echo 'Docker Hub quota: skipping optional non-release staging/dry-run; build and tests can continue'
    state=quota-skipped
    status=0
  fi
  rm -f "$log"
  if [[ "$action" == build || "$action" == stage-tested ]] && ((status == 0)) && [[ "$state" == quota-skipped ]]; then
    mkdir -p "${TMPDIR:-/tmp}/ci-staging-status"
    printf '%s\n%s\n%s\n' "$CIRCLE_SHA1" "$STAGING_RUN_ID" "$state" >"${TMPDIR:-/tmp}/ci-staging-status/$variant-$arch"
  fi
  exit "$status"
fi

if [[ "$action" == build || "$action" == stage-tested ]]; then
  [[ "${CIRCLE_BUILD_NUM:-}" =~ ^[0-9]+$ ]] || { echo 'CIRCLE_BUILD_NUM must identify the producer attempt' >&2; exit 1; }
  target=runtime
  if [[ "$variant" == pdfgen ]]; then
    target=runtime_pdfgen
  fi
  if [[ "$action" == stage-tested ]]; then
    tested_id="$(docker image inspect --format '{{.Id}}' redbox-portal:test)"
    [[ "$tested_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid tested image ID' >&2; exit 1; }
    echo "Tested amd64 image ID: $tested_id"
  fi
  login
  image="$(staging_image "$arch")"
  # A tag belongs to this producer attempt, never another workflow rerun.
  # Only a definite missing manifest permits a build; auth/network errors fail closed.
  inspection_error="$(mktemp)"
  trap 'rm -f "$inspection_error" "$inspection_error.runtime" "$inspection_error.test" "$inspection_error.local"' EXIT
  if digest="$(node "$SCRIPT_DIR/docker-registry.cjs" head "$image" 2>"$inspection_error")"; then
    echo "Reusing existing staging image $image"
    existing=true
  else
    status=$?
    existing=false
  fi
  cat "$inspection_error" >&2
  if ! "$existing" && ((status != 3)); then
    exit 1
  fi
  if ! "$existing"; then
    if [[ "$action" == stage-tested ]]; then
      docker image inspect --format '{{json .}}' redbox-portal:runtime >"$inspection_error.runtime"
      docker image inspect --format '{{json .}}' redbox-portal:test >"$inspection_error.test"
      node "$SCRIPT_DIR/verify-runtime-prefix.cjs" "$inspection_error.runtime" "$inspection_error.test" "$inspection_error.runtime"
      docker tag redbox-portal:runtime "$image"
    else
      source "$SCRIPT_DIR/docker-build-cache.sh"
      setup_build_cache "$variant"
      node "$SCRIPT_DIR/docker-context-fingerprint.cjs" . /tmp/ci-build-context
      build_image() {
        docker buildx build --progress plain --platform "linux/$arch" --target "$target" \
          --provenance=false "${CACHE_FROM[@]}" "${CACHE_TO[@]}" --tag "$image" --push .
      }
      run_cached_build build_image
    fi
    if [[ "$action" == stage-tested ]]; then docker push "$image"; fi
  fi
  if ! "$existing"; then digest="$(node "$SCRIPT_DIR/docker-registry.cjs" head "$image")"; fi
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid staging manifest digest' >&2; exit 1; }
  pinned_image="${REPO}@${digest}"
  if [[ "$action" == stage-tested ]]; then
    node "$SCRIPT_DIR/docker-registry.cjs" config "$pinned_image" >"$inspection_error.runtime"
    docker image inspect --format '{{json .}}' redbox-portal:test >"$inspection_error.test"
    docker image inspect --format '{{json .}}' redbox-portal:runtime >"$inspection_error.local"
    node "$SCRIPT_DIR/verify-runtime-prefix.cjs" "$inspection_error.runtime" "$inspection_error.test" "$inspection_error.local"
    echo "Verified staged runtime base of tested amd64 image: $tested_id ($pinned_image)"
  fi
  mkdir -p "${TMPDIR:-/tmp}/ci-staging-status"
  printf '%s\n%s\nverified\n%s\n' "$CIRCLE_SHA1" "$STAGING_RUN_ID" "$digest" >"${TMPDIR:-/tmp}/ci-staging-status/$variant-$arch"
  exit 0
fi

real_promotion=false
if is_release_branch; then
  real_promotion=true
else
  echo "DRY RUN: automatic promotion disabled for branch '${CIRCLE_BRANCH:-<unset>}'"
fi

sources=()
if [[ "$action" == promote ]]; then
  sources+=("$arch")
  destination="${REPO}:${DEPLOY_TAG}${suffix}-${arch}"
else
  # Both architectures consume the successful producers' digest artifacts.
  sources+=(amd64 arm64)
  destination="${REPO}:${DEPLOY_TAG}${suffix}"
fi

# Only writes require credentials. Public staging images can be inspected anonymously.
if "$real_promotion" || [[ -n "${DOCKER_USER:-}" && -n "${DOCKER_PASS:-}" ]]; then
  login
else
  echo 'DRY RUN: inspecting public staging images anonymously (no Docker push credentials)'
fi
pinned_sources=()
for source_arch in "${sources[@]}"; do
  digest="$(node "$SCRIPT_DIR/staging-quota-status.cjs" "$variant" "$source_arch")"
  if [[ "$digest" == quota-skipped || "$digest" == credential-skipped ]] && ! "$real_promotion"; then
    echo "DRY RUN: source staging was skipped ($digest) in this pipeline; no promotion"
    exit 0
  fi
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid producer staging digest' >&2; exit 1; }
  pinned_source="${REPO}@${digest}"
  resolved="$(node "$SCRIPT_DIR/docker-registry.cjs" head "$pinned_source")"
  [[ "$resolved" == "$digest" ]] || { echo 'Registry returned a different pinned digest' >&2; exit 1; }
  pinned_sources+=("$pinned_source")
  echo "Promotion source: $variant/$source_arch -> $pinned_source"
done
command=(docker buildx imagetools create)
if [[ "$action" == promote ]]; then
  # Copy the single-platform manifest without introducing an extra image index.
  command+=(--prefer-index=false)
fi
command+=(--tag "$destination" "${pinned_sources[@]}")
print_command "${command[@]}"
if "$real_promotion"; then
  # Keep the registry retry behavior used by the existing manifest publisher.
  max_attempts="${DOCKER_MANIFEST_CREATE_MAX_ATTEMPTS:-5}"
  base_delay="${DOCKER_MANIFEST_CREATE_BASE_DELAY_SECONDS:-60}"
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if "${command[@]}"; then
      exit 0
    fi
    if ((attempt == max_attempts)); then
      exit 1
    fi
    sleep "$((base_delay * attempt))"
  done
fi
