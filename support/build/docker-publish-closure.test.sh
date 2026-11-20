#!/usr/bin/env bash
# Exercise release ordering and registry identity without a daemon or credentials.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
export PATH="$scratch:$PATH" REPO=fixture/portal CIRCLE_BRANCH=fixture DOCKER_USER=fixture DOCKER_PASS=fixture
export DOCKER_CALLS="$scratch/calls" MOCK_REGISTRY="$scratch/registry" AUDIT_DENY='' MOCK_PUSH=ok
export DOCKER_PUBLISH_MAX_ATTEMPTS=1 DOCKER_MANIFEST_CREATE_MAX_ATTEMPTS=1
sha() { printf 'sha256:%064x' "$1"; }
export -f sha
mkdir "$MOCK_REGISTRY"
cat > "$scratch/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\n' "$*" >> "$DOCKER_CALLS"
if [[ "$1" == login ]]; then cat >/dev/null; fi
if [[ "$1" == push ]]; then
  tag="${2##*:}"
  case "$tag" in
    fixture-amd64) digest="$(sha 1)";;
    fixture-arm64) digest="$(sha 2)";;
    fixture-pdfgen-amd64) digest="$(sha 3)";;
    fixture-pdfgen-arm64) digest="$(sha 4)";;
    *) exit 1;;
  esac
  if [[ "$MOCK_PUSH" != missing ]]; then
    if [[ "$MOCK_PUSH" == malformed ]]; then digest=sha256:bad; fi
    printf '%s: digest: %s size: 525\n' "$tag" "$digest"
    if [[ "$MOCK_PUSH" == ambiguous ]]; then printf '%s: digest: %s size: 525\n' "$tag" "$(sha 88)"; fi
  fi
  if [[ "$MOCK_PUSH" == failed ]]; then exit 1; fi
  # Simulate the mutable tag being replaced before the manifest job reads it.
  printf '%s\n' "$(sha 99)" > "$MOCK_REGISTRY/$tag"
fi
if [[ "$*" == 'buildx imagetools create '* ]]; then
  for src in "${@:6}"; do
    if [[ "$src" != *@sha256:* ]]; then src="${src%:*}@$(cat "$MOCK_REGISTRY/${src##*:}")"; fi
    printf 'manifest source %s\n' "$src" >> "$DOCKER_CALLS"
  done
fi
MOCK
cat > "$scratch/timeout" <<'MOCK'
#!/usr/bin/env bash
[[ "$4" == */runtime-image-audit.cjs ]]
printf 'audit %s\n' "$5" >> "$DOCKER_CALLS"
[[ "$5" != "$AUDIT_DENY" ]]
MOCK
chmod +x "$scratch/"{docker,timeout}
reject() {
  if "$@"; then printf 'Unexpected success: %s\n' "$*" >&2; exit 1; fi
}
assert_manifest() {
  mapfile -t manifest_entries < <(grep '^manifest source ' "$DOCKER_CALLS")
  [[ "${manifest_entries[*]}" == "manifest source $REPO@$(sha "$1") manifest source $REPO@$(sha "$2")" ]]
}
for variant in runtime runtime_pdfgen; do
  suffix=''; amd=1; arm=2
  if [[ "$variant" == runtime_pdfgen ]]; then suffix=-pdfgen; amd=3; arm=4; fi
  for arch in amd64 arm64; do
    tag="${REPO}:fixture${suffix}-${arch}"
    : > "$DOCKER_CALLS"
    AUDIT_DENY="$tag" reject bash "$script_dir/docker-publish-${arch}-variant.sh" "$variant" "$suffix" "$scratch"
    grep -Fx "audit $tag" "$DOCKER_CALLS"
    if grep -q '^docker push' "$DOCKER_CALLS"; then exit 1; fi
    : > "$DOCKER_CALLS"
    bash "$script_dir/docker-publish-${arch}-variant.sh" "$variant" "$suffix" "$scratch"
    mapfile -t operations < <(grep -E '^(audit|docker push)' "$DOCKER_CALLS")
    [[ "${operations[*]}" == "audit $tag docker push $tag" ]]
    [[ "$(cat "$MOCK_REGISTRY/${tag##*:}")" == "$(sha 99)" ]]
  done
  : > "$DOCKER_CALLS"
  bash "$script_dir/docker-publish-manifest.sh" "$suffix" "$scratch"
  assert_manifest "$amd" "$arm"
  rm "$scratch/runtime${suffix}-arm64"
  : > "$DOCKER_CALLS"
  reject bash "$script_dir/docker-publish-manifest.sh" "$suffix" "$scratch"
  printf '%s %s\n' "${REPO}:wrong${suffix}-arm64" "$(sha "$arm")" > "$scratch/runtime${suffix}-arm64"
  reject bash "$script_dir/docker-publish-manifest.sh" "$suffix" "$scratch"
  if grep -q '^docker buildx imagetools create' "$DOCKER_CALLS"; then exit 1; fi

  : > "$DOCKER_CALLS"
  AUDIT_DENY="$REPO:fixture${suffix}-arm64" reject bash "$script_dir/docker-publish-multiarch.sh" "$variant" "$suffix"
  if grep -q '^docker push' "$DOCKER_CALLS"; then exit 1; fi
  : > "$DOCKER_CALLS"
  bash "$script_dir/docker-publish-multiarch.sh" "$variant" "$suffix"
  mapfile -t operations < <(grep -E '^(audit|docker push|docker buildx imagetools create)' "$DOCKER_CALLS")
  [[ ${#operations[@]} == 5 ]]
  [[ ${operations[0]} == "audit $REPO:fixture${suffix}-amd64" && ${operations[1]} == "audit $REPO:fixture${suffix}-arm64" ]]
  [[ ${operations[2]} == "docker push $REPO:fixture${suffix}-amd64" && ${operations[3]} == "docker push $REPO:fixture${suffix}-arm64" ]]
  assert_manifest "$amd" "$arm"
done
for mode in failed missing malformed ambiguous; do
  printf 'stale receipt\n' > "$scratch/bad"
  MOCK_PUSH="$mode" reject bash "$script_dir/docker-push-digest.sh" "$REPO:fixture-amd64" "$scratch/bad"
  [[ ! -e "$scratch/bad" ]]
done
printf 'Audited release ordering, immutable digests and fail-closed receipts passed.\n'
