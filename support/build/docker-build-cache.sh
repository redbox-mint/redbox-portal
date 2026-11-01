#!/usr/bin/env bash
# Source this helper; the caller supplies REPO and arch. No secrets in arguments/logs.
cache_scope() {
  local branch="$1" readable hash
  readable="$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_.-]+/-/g; s/^[.-]+//; s/[.-]+$//' | cut -c1-64)"
  hash="$(printf '%s' "$branch" | sha256sum | cut -c1-12)"
  printf '%s-%s' "${readable:-local}" "$hash"
}

setup_build_cache() {
  local scope fallback
  scope="$(cache_scope "${CIRCLE_BRANCH:-${CIRCLE_TAG:-local}}")"
  fallback="$(cache_scope develop)"
  CACHE_FROM=(--cache-from "type=registry,ref=${REPO}:buildcache-${scope}-${arch}")
  if [[ "$scope" != "$fallback" ]]; then
    CACHE_FROM+=(--cache-from "type=registry,ref=${REPO}:buildcache-${fallback}-${arch}")
  fi
  CACHE_TO=()
  if [[ -n "${DOCKER_USER:-}" && -n "${DOCKER_PASS:-}" ]]; then
    echo "$DOCKER_PASS" | docker login --username "$DOCKER_USER" --password-stdin
    CACHE_TO=(--cache-to "type=registry,mode=max,image-manifest=true,oci-mediatypes=true,ref=${REPO}:buildcache-${scope}-${arch}")
  else
    echo 'Registry cache is read-only: Docker push credentials unavailable'
  fi
  # docker-container supports registry mode=max on remote Docker and machine executors.
  docker buildx create --name ci-cache --driver docker-container --use
  docker buildx inspect --bootstrap
}
