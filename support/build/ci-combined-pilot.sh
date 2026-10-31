#!/usr/bin/env bash
set -euo pipefail
variant=${1:?expected control or candidate}
case "$variant" in control|candidate) ;; *) exit 2 ;; esac
[ "${CIRCLE_BRANCH:-}" = chore/circleci-performance ]
[ -z "${CIRCLE_TAG:-}" ]
[[ "${CIRCLE_SHA1:-}" =~ ^[0-9a-f]{40}$ ]]
[[ "${CIRCLE_WORKFLOW_JOB_ID:-}" =~ ^[0-9a-f-]{36}$ ]]
[ "$(git rev-parse HEAD)" = "$CIRCLE_SHA1" ]
[ -z "$(git status --porcelain --untracked-files=normal)" ]
[ "$(uname -m)" = aarch64 ]
builder="combined-${CIRCLE_WORKFLOW_JOB_ID}"
image="localhost/combined-pilot:${CIRCLE_WORKFLOW_JOB_ID}"
output="$PWD/.tmp/ci-combined-pilot"
docker_config=$(mktemp -d /tmp/redbox-combined-docker.XXXXXXXX)
mkdir -p "$output"
printf '{"auths":{}}\n' > "$docker_config/config.json"
export DOCKER_CONFIG="$docker_config" DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_AUTH_CONFIG DOCKER_TLS_VERIFY DOCKER_CERT_PATH BUILDKIT_HOST BUILDKIT_SOURCE_POLICY BUILDX_BUILDER BUILDX_CONFIG
cleanup() {
  docker buildx rm --force "$builder" || true
  docker image rm "$image" || true
  rm -rf -- "$docker_config"
}
trap cleanup EXIT
file=Dockerfile
[ "$variant" = control ] || file=support/build/Dockerfile.combined-pilot
printf '%s\n' "$CIRCLE_SHA1" > "$output/revision.txt"
printf '%s\n' "$variant" > "$output/variant.txt"
docker buildx create --name "$builder" --driver docker-container --use
docker buildx inspect --bootstrap --builder "$builder"
for run in cold warm; do
  node support/build/ci-performance.cjs run "combined-${variant}-${run}" -- \
    docker buildx build --builder "$builder" --platform linux/arm64 --no-cache --progress plain \
      --file "$file" --target test --tag "$image" --load .
  node support/build/docker-image-contract.cjs "$image" test linux/arm64 > "$output/$run-contract.json"
done
