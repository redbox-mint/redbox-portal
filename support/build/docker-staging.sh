#!/usr/bin/env bash
set -euo pipefail

# Automatic branch publishing only. Tag and manual releases use the existing scripts.
is_release_branch() {
  [[ "${CIRCLE_BRANCH:-}" =~ ^(master|develop|support/.*)$ ]]
}

action="${1:?expected build, promote, manifest, or can-promote}"
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
  build|promote)
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

if [[ "$action" == build ]]; then
  # Preserve the historical automatic publishing contents: amd64 uses test,
  # arm64 uses runtime, and both PDF variants use runtime_pdfgen.
  target=runtime
  if [[ "$variant" == pdfgen ]]; then
    target=runtime_pdfgen
  elif [[ "$arch" == amd64 ]]; then
    target=test
  fi
  login
  image="$(staging_image "$arch")"
  # Reuse a pipeline's staging tag on reruns rather than replacing its contents.
  # Only a definite missing manifest permits a build; auth/network errors fail closed.
  inspection_error="$(mktemp)"
  trap 'rm -f "$inspection_error"' EXIT
  if docker manifest inspect "$image" >/dev/null 2>"$inspection_error"; then
    echo "Reusing existing staging image $image"
    exit 0
  fi
  if ! grep -Eqi 'no such manifest|manifest unknown|manifest_unknown' "$inspection_error"; then
    cat "$inspection_error" >&2
    exit 1
  fi
  docker build --progress plain --platform "linux/$arch" --target "$target" --tag "$image" .
  docker push "$image"
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

# Verify the staging references even during the chore-branch dry run.
login
for source_image in "${sources[@]}"; do
  docker buildx imagetools inspect "$source_image"
done
command=(docker buildx imagetools create)
if [[ "$action" == promote ]]; then
  # Copy the single-platform manifest without introducing an extra image index.
  command+=(--prefer-index=false)
fi
command+=(--tag "$destination" "${sources[@]}")
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
