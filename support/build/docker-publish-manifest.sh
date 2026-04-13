#!/usr/bin/env bash
set -euo pipefail

SUFFIX="${1:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

echo "${DOCKER_PASS}" | docker login --username "${DOCKER_USER}" --password-stdin

docker manifest create "${REPO}:${DEPLOY_TAG}${SUFFIX}" \
  "${REPO}:${DEPLOY_TAG}${SUFFIX}-amd64" \
  "${REPO}:${DEPLOY_TAG}${SUFFIX}-arm64"

docker manifest push "${REPO}:${DEPLOY_TAG}${SUFFIX}"
