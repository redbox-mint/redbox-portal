#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?docker target is required}"
SUFFIX="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

target_image="${REPO}:${DEPLOY_TAG}${SUFFIX}"
amd64_image="${target_image}-amd64"
arm64_image="${target_image}-arm64"
builder_name="${DOCKER_BUILDX_BUILDER_NAME:-redbox-portal-multiarch}"
platforms="${DOCKER_PUBLISH_PLATFORMS:-linux/amd64,linux/arm64}"
max_attempts="${DOCKER_PUBLISH_MAX_ATTEMPTS:-5}"
base_delay_seconds="${DOCKER_PUBLISH_BASE_DELAY_SECONDS:-60}"

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

resolve_platform_digest() {
  local manifest_json="$1"
  local architecture="$2"

  printf '%s' "${manifest_json}" | node -e '
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const manifest = JSON.parse(input);
  const entry = (manifest.manifests || []).find((item) => item.platform && item.platform.os === "linux" && item.platform.architecture === process.argv[1]);
  if (!entry || !entry.digest) {
    process.exit(1);
  }
  process.stdout.write(entry.digest);
});
' "${architecture}"
}

cleanup_builder() {
  docker buildx rm "${builder_name}" >/dev/null 2>&1 || true
}

trap cleanup_builder EXIT

echo "${DOCKER_PASS}" | docker login --username "${DOCKER_USER}" --password-stdin

docker run --privileged --rm tonistiigi/binfmt --install arm64
docker buildx create --name "${builder_name}" --driver docker-container --use
docker buildx inspect --bootstrap

echo "Publishing ${target_image} from Dockerfile target ${TARGET} for ${platforms}"
docker buildx build \
  --progress plain \
  --platform "${platforms}" \
  --target "${TARGET}" \
  --tag "${target_image}" \
  --push \
  .

manifest_json="$(docker buildx imagetools inspect --raw "${target_image}")"
amd64_digest="$(resolve_platform_digest "${manifest_json}" amd64)"
arm64_digest="$(resolve_platform_digest "${manifest_json}" arm64)"

retry_command "create amd64 alias ${amd64_image}" \
  docker buildx imagetools create --tag "${amd64_image}" "${REPO}@${amd64_digest}"

retry_command "create arm64 alias ${arm64_image}" \
  docker buildx imagetools create --tag "${arm64_image}" "${REPO}@${arm64_digest}"

echo "Published ${target_image}, ${amd64_image}, and ${arm64_image}"