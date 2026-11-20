#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?docker target is required}"
SUFFIX="${2:-}"
receipt_dir="${3:-/tmp/release-digests}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

echo "${DOCKER_PASS}" | docker login --username "${DOCKER_USER}" --password-stdin

docker build \
  --progress plain \
  --platform linux/amd64 \
  --target "${TARGET}" \
  --tag "${REPO}:${DEPLOY_TAG}${SUFFIX}-amd64" \
  .

bash "${SCRIPT_DIR}/docker-audit-runtime.sh" "${REPO}:${DEPLOY_TAG}${SUFFIX}-amd64"
bash "${SCRIPT_DIR}/docker-push-digest.sh" "${REPO}:${DEPLOY_TAG}${SUFFIX}-amd64" \
  "${receipt_dir}/runtime${SUFFIX}-amd64"
