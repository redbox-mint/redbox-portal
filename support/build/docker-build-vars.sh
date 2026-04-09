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

export DEPLOY_TAG="${TAG//\//-}"
