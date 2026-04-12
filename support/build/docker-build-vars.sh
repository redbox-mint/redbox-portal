#!/usr/bin/env bash
set -euo pipefail

export REPO="${REPO:-qcifengineering/redbox-portal}"

if [[ -n "${CIRCLE_BRANCH:-}" ]]; then
  export TAG="${CIRCLE_BRANCH}"
elif [[ -n "${CIRCLE_TAG:-}" ]]; then
  export TAG="${CIRCLE_TAG}"
else
  export TAG="local"
fi

sanitized_tag="$(printf '%s' "${TAG}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_.-]+/-/g; s/-+/-/g; s/^[.-]+//; s/[.-]+$//')"
export DEPLOY_TAG="${sanitized_tag:-local}"
