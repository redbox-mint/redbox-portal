#!/usr/bin/env bash
# Source this helper; the caller supplies REPO and arch. No secrets in arguments/logs.
cache_scope() {
  local branch="$1" readable hash
  readable="$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_.-]+/-/g; s/^[.-]+//; s/[.-]+$//' | cut -c1-64)"
  hash="$(printf '%s' "$branch" | sha256sum | cut -c1-12)"
  printf '%s-%s' "${readable:-local}" "$hash"
}

setup_build_cache() {
  local scope fallback ref status i
  scope="$(cache_scope "${CIRCLE_BRANCH:-${CIRCLE_TAG:-local}}")"
  fallback="$(cache_scope develop)"
  CACHE_FROM=(--cache-from "type=registry,ref=${REPO}:buildcache-v1-${scope}-${arch}")
  if [[ "$scope" != "$fallback" ]]; then
    CACHE_FROM+=(--cache-from "type=registry,ref=${REPO}:buildcache-v1-${fallback}-${arch}")
  fi
  CACHE_TO=()
  if [[ -n "${DOCKER_USER:-}" && -n "${DOCKER_PASS:-}" ]]; then
    echo "$DOCKER_PASS" | docker login --username "$DOCKER_USER" --password-stdin
    CACHE_TO=(--cache-to "type=registry,mode=max,image-manifest=true,oci-mediatypes=true,ref=${REPO}:buildcache-v1-${scope}-${arch}")
  else
    echo 'Registry cache is read-only: Docker push credentials unavailable'
  fi
  # HEAD is not a Docker Hub pull. Omit absent caches and avoid trying GETs
  # when the account has no allowance. Do not treat auth/network errors as quota.
  local available=()
  for ((i=1; i<${#CACHE_FROM[@]}; i+=2)); do
    ref="${CACHE_FROM[i]#type=registry,ref=}"
    if node "$SCRIPT_DIR/docker-registry.cjs" cache "$ref" >/dev/null; then
      available+=(--cache-from "${CACHE_FROM[i]}")
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
  docker buildx create --name ci-cache --driver docker-container --driver-opt image=mirror.gcr.io/moby/buildkit:buildx-stable-1 --use --buildkitd-config "$SCRIPT_DIR/buildkitd.toml"
  docker buildx inspect --bootstrap
}

# A quota can be exhausted after the HEAD preflight. Retry only quota failures,
# without cache inputs/exports; BuildKit retains local solve results on retry.
run_cached_build() {
  local log status
  log="$(mktemp)"
  if "$@" 2>&1 | tee "$log"; then
    if grep -Eqi 'toomanyrequests|too many requests|pull (rate |quota|limit)|429 Too Many Requests' "$log"; then
      echo 'Docker Hub quota on optional registry cache: build completed without the unavailable cache reads/writes'
    fi
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
