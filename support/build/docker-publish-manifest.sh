#!/usr/bin/env bash
set -euo pipefail

SUFFIX="${1:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

echo "${DOCKER_PASS}" | docker login --username "${DOCKER_USER}" --password-stdin

docker buildx imagetools create \
  --tag "${REPO}:${DEPLOY_TAG}${SUFFIX}" \
  "${REPO}:${DEPLOY_TAG}${SUFFIX}-amd64" \
  "${REPO}:${DEPLOY_TAG}${SUFFIX}-arm64"
