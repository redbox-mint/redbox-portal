#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/docker-build-vars.sh"
source "$SCRIPT_DIR/docker-build-cache.sh"
arch=amd64
setup_build_cache
build_image() {
  # One Bake invocation solves the shared graph once and exports both targets.
  local args=(--set '*.platform=linux/amd64' --set '*.attest=type=provenance,disabled=true')
  for ((i=1; i<${#CACHE_FROM[@]}; i+=2)); do
    args+=(--set "*.cache-from+=${CACHE_FROM[i]}")
  done
  # Only test exports the cache: it includes runtime, and two writers would race.
  if ((${#CACHE_TO[@]})); then args+=(--set "test.cache-to=${CACHE_TO[1]}"); fi
  docker buildx bake -f support/build/docker-bake.hcl --progress plain "${args[@]}"
}
run_cached_build build_image
