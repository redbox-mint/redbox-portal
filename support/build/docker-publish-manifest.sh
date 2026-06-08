#!/usr/bin/env bash
set -euo pipefail

SUFFIX="${1:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

target_image="${REPO}:${DEPLOY_TAG}${SUFFIX}"
amd64_image="${target_image}-amd64"
arm64_image="${target_image}-arm64"
max_attempts="${DOCKER_MANIFEST_CREATE_MAX_ATTEMPTS:-5}"
base_delay_seconds="${DOCKER_MANIFEST_CREATE_BASE_DELAY_SECONDS:-60}"

echo "${DOCKER_PASS}" | docker login --username "${DOCKER_USER}" --password-stdin

for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  echo "Creating multi-arch manifest ${target_image} from ${amd64_image} and ${arm64_image} (attempt ${attempt}/${max_attempts})"

  if docker buildx imagetools create \
    --tag "${target_image}" \
    "${amd64_image}" \
    "${arm64_image}"; then
    exit 0
  fi

  if ((attempt == max_attempts)); then
    echo "Failed to create ${target_image} after ${max_attempts} attempts. Docker Hub may be rate limiting manifest reads for ${amd64_image} and ${arm64_image}."
    exit 1
  fi

  delay_seconds=$((base_delay_seconds * attempt))
  echo "Manifest creation hit a transient failure; retrying in ${delay_seconds}s."
  sleep "${delay_seconds}"
done
