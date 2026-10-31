#!/usr/bin/env bash
set -euo pipefail

# Automatic branch publishing only. Tag and manual releases use the existing scripts.
is_release_branch() {
  [[ "${CIRCLE_BRANCH:-}" =~ ^(master|develop|support/.*)$ ]]
}

action="${1:?expected build, stage-tested, promote, manifest, or can-promote}"
if [[ "$action" == can-promote ]]; then
  is_release_branch
  exit $?
fi

variant="${2:?expected runtime or pdfgen}"
arch="${3:-}"
case "$variant" in
  runtime) suffix='' ;;
  pdfgen) suffix='-pdfgen' ;;
  *) echo "Unsupported variant: $variant" >&2; exit 1 ;;
esac
case "$action" in
  build|stage-tested|promote)
    [[ "$arch" == amd64 || "$arch" == arm64 ]] || { echo 'Expected amd64 or arm64' >&2; exit 1; }
    ;;
  manifest) ;;
  *) echo "Unsupported action: $action" >&2; exit 1 ;;
esac

[[ "${CIRCLE_SHA1:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'CIRCLE_SHA1 must be a full commit SHA' >&2; exit 1; }
# A pipeline ID prevents different pipelines for the same SHA from sharing staging tags.
# It stays the same on workflow reruns, allowing failed-job reruns to reuse staging images.
[[ "${STAGING_RUN_ID:-}" =~ ^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$ ]] || { echo 'STAGING_RUN_ID must be the pipeline UUID' >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docker-build-vars.sh"

staging_image() {
  printf '%s:ci-staging-%s-%s-%s-%s' "$REPO" "$CIRCLE_SHA1" "$variant" "$1" "$STAGING_RUN_ID"
}

login() {
  echo "${DOCKER_PASS:?}" | docker login --username "${DOCKER_USER:?}" --password-stdin
}

print_command() {
  printf '%q ' "$@"
  printf '\n'
}

if [[ "$action" == stage-tested ]]; then
  [[ "$variant/$arch" == runtime/amd64 ]] || { echo 'Only runtime/amd64 can stage the tested image' >&2; exit 1; }
  # Forks and ordinary branches must still be able to build/test without secrets.
  if [[ -z "${DOCKER_USER:-}" || -z "${DOCKER_PASS:-}" ]]; then
    echo 'Skipping tested-image staging push: DOCKER_USER/DOCKER_PASS unavailable; build and tests can continue'
    exit 0
  fi
elif [[ "$action" == build && "$variant/$arch" == runtime/amd64 ]]; then
  echo 'Use stage-tested for runtime/amd64; rebuilding would publish an untested image' >&2
  exit 1
fi

manifest_config_id() {
  node -e 'const fs = require("node:fs"); const id = JSON.parse(fs.readFileSync(0, "utf8")).config?.digest;
    if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error("Expected a single-platform image config digest");
    console.log(id);'
}

if [[ "$action" == build || "$action" == stage-tested ]]; then
  target=runtime
  if [[ "$variant" == pdfgen ]]; then
    target=runtime_pdfgen
  fi
  if [[ "$action" == stage-tested ]]; then
    tested_id="$(docker image inspect --format '{{.Id}}' redbox-portal:test)"
    [[ "$tested_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid tested image ID' >&2; exit 1; }
    echo "Tested amd64 image ID: $tested_id"
  fi
  login
  image="$(staging_image "$arch")"
  # Reuse a pipeline's staging tag on reruns rather than replacing its contents.
  # Only a definite missing manifest permits a build; auth/network errors fail closed.
  inspection_error="$(mktemp)"
  trap 'rm -f "$inspection_error"' EXIT
  if docker manifest inspect "$image" >/dev/null 2>"$inspection_error"; then
    echo "Reusing existing staging image $image"
    if [[ "$action" == build ]]; then
      exit 0
    fi
    existing=true
  else
    existing=false
  fi
  if ! "$existing" && ! grep -Eqi 'no such manifest|manifest unknown|manifest_unknown' "$inspection_error"; then
    cat "$inspection_error" >&2
    exit 1
  fi
  if ! "$existing"; then
    if [[ "$action" == stage-tested ]]; then
      docker tag "$tested_id" "$image"
    else
      docker build --progress plain --platform "linux/$arch" --target "$target" --tag "$image" .
    fi
    docker push "$image"
  fi
  if [[ "$action" == stage-tested ]]; then
    staged_id="$(docker manifest inspect "$image" | manifest_config_id)"
    echo "Staged amd64 image config digest: $staged_id"
    [[ "$staged_id" == "$tested_id" ]] || { echo 'Staging image differs from the tested image; refusing promotion' >&2; exit 1; }
    echo "Verified tested/staged amd64 image identity: $tested_id ($image)"
  fi
  exit 0
fi

real_promotion=false
if is_release_branch; then
  real_promotion=true
else
  echo "DRY RUN: automatic promotion disabled for branch '${CIRCLE_BRANCH:-<unset>}'"
fi

sources=()
if [[ "$action" == promote ]]; then
  sources+=("$(staging_image "$arch")")
  destination="${REPO}:${DEPLOY_TAG}${suffix}-${arch}"
else
  # Read workflow-specific staging tags, never the mutable per-arch release tags.
  # Overlapping workflows therefore cannot mix architectures from different commits.
  sources+=("$(staging_image amd64)" "$(staging_image arm64)")
  destination="${REPO}:${DEPLOY_TAG}${suffix}"
fi

# Only writes require credentials. Public staging images can be inspected anonymously.
if "$real_promotion" || [[ -n "${DOCKER_USER:-}" && -n "${DOCKER_PASS:-}" ]]; then
  login
else
  echo 'DRY RUN: inspecting public staging images anonymously (no Docker push credentials)'
fi
pinned_sources=()
for source_image in "${sources[@]}"; do
  docker buildx imagetools inspect "$source_image"
  digest="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$source_image")"
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid staging manifest digest' >&2; exit 1; }
  pinned_source="${REPO}@${digest}"
  pinned_sources+=("$pinned_source")
  echo "Promotion source: $source_image -> $pinned_source"
  if [[ "$variant" == runtime && "$source_image" == "$(staging_image amd64)" ]]; then
    config_id="$(docker buildx imagetools inspect --raw "$pinned_source" | manifest_config_id)"
    echo "Promotion amd64 image config digest: $config_id"
  fi
done
command=(docker buildx imagetools create)
if [[ "$action" == promote ]]; then
  # Copy the single-platform manifest without introducing an extra image index.
  command+=(--prefer-index=false)
fi
command+=(--tag "$destination" "${pinned_sources[@]}")
print_command "${command[@]}"
if "$real_promotion"; then
  # Keep the registry retry behavior used by the existing manifest publisher.
  max_attempts="${DOCKER_MANIFEST_CREATE_MAX_ATTEMPTS:-5}"
  base_delay="${DOCKER_MANIFEST_CREATE_BASE_DELAY_SECONDS:-60}"
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if "${command[@]}"; then
      exit 0
    fi
    if ((attempt == max_attempts)); then
      exit 1
    fi
    sleep "$((base_delay * attempt))"
  done
fi
