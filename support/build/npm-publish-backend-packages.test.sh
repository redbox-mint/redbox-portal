#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/npm-publish-backend-packages.sh"

assert_equal() {
  local expected="$1"
  local actual="$2"
  local description="$3"

  if [[ "$actual" != "$expected" ]]; then
    printf 'FAIL: %s (expected %s, got %s)\n' "$description" "$expected" "$actual" >&2
    exit 1
  fi
}

assert_validates() {
  local release_kind="$1"
  local tag="$2"
  local dist_tag="$3"

  env \
    NPM_RELEASE_KIND="$release_kind" \
    CIRCLE_TAG="$tag" \
    NPM_DIST_TAG="$dist_tag" \
    NPM_PUBLISH_DRY_RUN=true \
    bash -c 'source "$1"; validate_inputs' bash "$SCRIPT_PATH"
}

assert_rejects() {
  local release_kind="$1"
  local tag="$2"
  local dist_tag="$3"

  if assert_validates "$release_kind" "$tag" "$dist_tag" 2>/dev/null; then
    printf 'FAIL: expected validation to reject %s\n' "$tag" >&2
    exit 1
  fi
}

rc_version="$({
  env \
    NPM_RELEASE_KIND=rc \
    CIRCLE_TAG=v5.0.0-RC1 \
    NPM_DIST_TAG=next \
    NPM_PUBLISH_DRY_RUN=true \
    bash -c 'source "$1"; final_version' bash "$SCRIPT_PATH"
})"
assert_equal "5.0.0-RC1" "$rc_version" "RC tag is converted to the npm package version"

stable_version="$({
  env \
    NPM_RELEASE_KIND=release \
    CIRCLE_TAG=v5.0.0 \
    NPM_DIST_TAG=latest \
    NPM_PUBLISH_DRY_RUN=true \
    bash -c 'source "$1"; final_version' bash "$SCRIPT_PATH"
})"
assert_equal "5.0.0" "$stable_version" "stable tag keeps the stable package version"

assert_validates rc v5.0.0-RC1 next
assert_validates release v5.0.0 latest
assert_rejects rc v5.0-RC1 next
assert_rejects rc v5.0.0-RC1 latest
assert_rejects release v5.0.0-RC1 latest

printf 'npm publish version handling tests passed.\n'
