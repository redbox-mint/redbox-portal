#!/usr/bin/env bash
set -euo pipefail

: "${DOCKER_USER:?DOCKER_USER is required}"
: "${DOCKER_PASS:?DOCKER_PASS is required}"

export REPO=${REPO:-qcifengineering/redbox-portal}

if [[ -n "${CIRCLE_BRANCH:-}" ]]; then
  export TAG="$CIRCLE_BRANCH"
elif [[ -n "${CIRCLE_TAG:-}" ]]; then
  export TAG="$CIRCLE_TAG"
else
  export TAG="local"
fi

export DEPLOY_TAG=${TAG//\//-}

echo "${DOCKER_PASS}" | docker login --username "${DOCKER_USER}" --password-stdin

docker run --privileged --rm tonistiigi/binfmt --install arm64 >/dev/null 2>&1 || true

if docker buildx inspect multibuilder >/dev/null 2>&1; then
  docker buildx use multibuilder
else
  docker buildx create --name multibuilder --driver docker-container --bootstrap --use
fi

docker buildx inspect multibuilder

BUILD_CACHE_REF="${REPO}:buildcache"

docker buildx build \
  -f Dockerfile \
  -t "${REPO}:${DEPLOY_TAG}" \
  --platform linux/amd64,linux/arm64 \
  --cache-from "type=registry,ref=${BUILD_CACHE_REF}" \
  --cache-to "type=registry,ref=${BUILD_CACHE_REF},mode=max" \
  --push \
  .

if [[ "${SMOKE_TEST:-false}" == "true" ]]; then
  docker buildx build \
    -f Dockerfile \
    --target runtime \
    --load \
    -t "${REPO}:${DEPLOY_TAG}-smoke" \
    .
fi
