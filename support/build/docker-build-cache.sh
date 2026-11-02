#!/usr/bin/env bash
# Source this helper; the caller supplies REPO and arch. No secrets in arguments/logs.
cache_scope() {
  local branch="$1" readable hash
  readable="$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_.-]+/-/g; s/^[.-]+//; s/[.-]+$//' | cut -c1-64)"
  hash="$(printf '%s' "$branch" | sha256sum | cut -c1-12)"
  printf '%s-%s' "${readable:-local}" "$hash"
}

setup_build_cache() {
  local scope fallback ref status i digest cache_target candidate target_ref
  cache_target="${1:?expected cache target: test, runtime, or pdfgen}"
  case "$cache_target" in test|runtime|pdfgen) ;; *) return 1 ;; esac
  scope="$(cache_scope "${CIRCLE_BRANCH:-${CIRCLE_TAG:-local}}")"
  fallback="$(cache_scope develop)"
  CACHE_FROM=()
  # Own cache first. Siblings can seed common ancestors without competing exports.
  for candidate in "$scope" "$fallback"; do
    for target_ref in "$cache_target" test runtime pdfgen; do
      ref="${REPO}:buildcache-v2-${candidate}-${arch}-${target_ref}"
      if [[ " ${CACHE_FROM[*]} " != *"ref=${ref} "* ]]; then
        CACHE_FROM+=(--cache-from "type=registry,ref=$ref")
      fi
    done
  done
  CACHE_TO=()
  if [[ -n "${DOCKER_USER:-}" && -n "${DOCKER_PASS:-}" ]]; then
    echo "$DOCKER_PASS" | docker login --username "$DOCKER_USER" --password-stdin
    CACHE_TO=(--cache-to "type=registry,mode=max,image-manifest=true,oci-mediatypes=true,ref=${REPO}:buildcache-v2-${scope}-${arch}-${cache_target}")
  else
    echo 'Registry cache is read-only: Docker push credentials unavailable'
  fi
  # HEAD is not a Docker Hub pull. Omit absent caches and avoid trying GETs
  # when the account has no allowance. Do not treat auth/network errors as quota.
  local available=()
  for ((i=1; i<${#CACHE_FROM[@]}; i+=2)); do
    ref="${CACHE_FROM[i]#type=registry,ref=}"
    if digest="$(node "$SCRIPT_DIR/docker-registry.cjs" cache "$ref")"; then
      echo "Registry cache import: $ref -> $digest"
      available+=(--cache-from "type=registry,ref=${REPO}@${digest}")
      # mode=max carries all ancestors. One available cache avoids spending Hub
      # allowance on redundant sibling/develop manifest GETs on warm builds.
      break
    else
      status=$?
      if ((status == 3)); then
        echo "Registry cache absent: $ref"
      elif ((status == 4)) && [[ ! "${CIRCLE_BRANCH:-}" =~ ^(master|develop|support/.*)$ ]]; then
        echo 'Docker Hub quota: non-release build continues uncached; registry cache reads/writes disabled'
        available=(); CACHE_TO=()
        break
      else
        return "$status"
      fi
    fi
  done
  CACHE_FROM=("${available[@]}")
  if ((${#CACHE_TO[@]})) && [[ ! "${CIRCLE_BRANCH:-}" =~ ^(master|develop|support/.*)$ ]]; then
    # Cache export is an optimization, never a reason to fail a branch's tests.
    CACHE_TO[1]+=,ignore-error=true
  fi
  # docker-container supports registry mode=max on remote Docker and machine executors.
  # Bootstrap runs before buildkitd.toml can provide mirror fallback.
  local buildkit_ref='moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea'
  local buildkit_image="mirror.gcr.io/$buildkit_ref"
  if ! docker pull "$buildkit_image"; then
    echo 'BuildKit bootstrap mirror unavailable; retrying the same digest on Docker Hub'
    buildkit_image="docker.io/$buildkit_ref"
    docker pull "$buildkit_image" || return $?
  fi
  docker buildx create --name ci-cache --driver docker-container --driver-opt "image=$buildkit_image" --use --buildkitd-config "$SCRIPT_DIR/buildkitd.toml"
  docker buildx inspect --bootstrap
}

# A quota can be exhausted after the HEAD preflight. Retry only quota failures,
# without cache inputs/exports; BuildKit retains local solve results on retry.
run_cached_build() {
  local log status
  log="$(mktemp)"
  if "$@" 2>&1 | tee "$log"; then
    rm -f "$log"
    return 0
  else
    status=${PIPESTATUS[0]}
  fi
  if [[ ! "${CIRCLE_BRANCH:-}" =~ ^(master|develop|support/.*)$ ]] &&
      tail -n 1 "$log" | grep -Eqi 'toomanyrequests|too many requests|pull (rate |quota|limit)|429 Too Many Requests' &&
      grep -Eqi 'cache (manifest|import|export)|cache-from|cache-to|exporting cache|importing cache' "$log"; then
    echo 'Docker Hub quota during cache access: non-release build retries uncached with registry cache reads/writes disabled'
    CACHE_FROM=(); CACHE_TO=()
    rm -f "$log"
    build_image
  else
    rm -f "$log"
    return "$status"
  fi
}
