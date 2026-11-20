#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?docker target is required}"
SUFFIX="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

target_image="${REPO}:${DEPLOY_TAG}${SUFFIX}"
builder_name="${DOCKER_BUILDX_BUILDER_NAME:-redbox-portal-multiarch}"
platforms="${DOCKER_PUBLISH_PLATFORMS:-linux/amd64,linux/arm64}"
max_attempts="${DOCKER_PUBLISH_MAX_ATTEMPTS:-5}"
base_delay_seconds="${DOCKER_PUBLISH_BASE_DELAY_SECONDS:-60}"
receipt_dir="$(mktemp -d)"

retry_command() {
  local description="$1"
  shift

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    echo "${description} (attempt ${attempt}/${max_attempts})"

    if "$@"; then
      return 0
    fi

    if ((attempt == max_attempts)); then
      echo "Failed to ${description} after ${max_attempts} attempts. Docker Hub may be rate limiting registry operations."
      return 1
    fi

    delay_seconds=$((base_delay_seconds * attempt))
    echo "${description} failed; retrying in ${delay_seconds}s."
    sleep "${delay_seconds}"
  done
}

cleanup_builder() {
  rm -rf "$receipt_dir"
  docker buildx rm "${builder_name}" >/dev/null 2>&1 || true
}

trap cleanup_builder EXIT

echo "${DOCKER_PASS}" | docker login --username "${DOCKER_USER}" --password-stdin

docker run --privileged --rm tonistiigi/binfmt --install arm64
docker buildx create --name "${builder_name}" --driver docker-container --use
docker buildx inspect --bootstrap

# Loading one platform per build lets the filesystem gate inspect the exact
# local image that will be pushed. Qualify both before publishing either.
IFS=, read -ra selected_platforms <<< "${platforms}"
if [[ "${platforms}" != linux/amd64,linux/arm64 && "${platforms}" != linux/arm64,linux/amd64 ]]; then
  echo 'The multi-arch release requires both linux/amd64 and linux/arm64.' >&2
  exit 1
fi
for platform in "${selected_platforms[@]}"; do
  image="${target_image}-${platform#linux/}"
  docker buildx build \
    --progress plain \
    --platform "${platform}" \
    --target "${TARGET}" \
    --tag "${image}" \
    --load \
    .
  bash "${SCRIPT_DIR}/docker-audit-runtime.sh" "${image}"
done

for arch in amd64 arm64; do
  image="${target_image}-${arch}"
  retry_command "push ${image}" bash "${SCRIPT_DIR}/docker-push-digest.sh" "${image}" \
    "${receipt_dir}/runtime${SUFFIX}-${arch}"
done
DOCKER_MANIFEST_CREATE_MAX_ATTEMPTS="${max_attempts}" \
DOCKER_MANIFEST_CREATE_BASE_DELAY_SECONDS="${base_delay_seconds}" \
  bash "${SCRIPT_DIR}/docker-publish-manifest.sh" "${SUFFIX}" "${receipt_dir}"
