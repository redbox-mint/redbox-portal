#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?docker target is required}"
SUFFIX="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

echo "${DOCKER_PASS}" | docker login --username "${DOCKER_USER}" --password-stdin

docker build \
  --progress plain \
  --platform linux/arm64 \
  --target "${TARGET}" \
  --tag "${REPO}:${DEPLOY_TAG}${SUFFIX}-arm64" \
  .

docker push "${REPO}:${DEPLOY_TAG}${SUFFIX}-arm64"

