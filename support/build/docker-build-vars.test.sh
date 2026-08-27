#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docker-build-vars.sh"

assert_equal() {
  local expected="$1"
  local actual="$2"
  local description="$3"

  if [[ "${actual}" != "${expected}" ]]; then
    printf 'FAIL: %s (expected %s, got %s)\n' "${description}" "${expected}" "${actual}" >&2
    exit 1
  fi
}

deploy_tag_for() {
  local branch="$1"
  local tag="$2"

  env \
    CIRCLE_BRANCH="${branch}" \
    CIRCLE_TAG="${tag}" \
    bash -c 'source "$1"; printf "%s" "${DEPLOY_TAG}"' bash "${SCRIPT_PATH}"
}

assert_equal \
  "v5.0.0-rc2" \
  "$(deploy_tag_for "" "v5.0.0-RC2")" \
  "release candidate tags are normalized for Docker"

assert_equal \
  "feature-pdf-tags" \
  "$(deploy_tag_for "feature/PDF Tags" "")" \
  "branch names are normalized for Docker"

assert_equal \
  "local" \
  "$(deploy_tag_for "" "")" \
  "local builds use the local tag"

printf 'Docker tag handling tests passed.\n'
