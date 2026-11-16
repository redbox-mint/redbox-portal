#!/usr/bin/env bash

set -euo pipefail

credentials_file="${REDBOX_BEDROCK_CREDENTIALS_FILE:-}"
if [[ -z "$credentials_file" || ! -f "$credentials_file" ]]; then
  echo "Set REDBOX_BEDROCK_CREDENTIALS_FILE to a readable Bedrock credentials shell file." >&2
  exit 1
fi

# The credentials remain outside the repository and are inherited only by the
# local Docker Compose process and its portal container.
# shellcheck source=/dev/null
source "$credentials_file"

export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-southeast-2}}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"
export REDBOX_GENERATION_ENABLED="${REDBOX_GENERATION_ENABLED:-true}"
export REDBOX_GENERATION_ADAPTERS="${REDBOX_GENERATION_ADAPTERS:-bedrock,fake}"

exec docker compose -f ./support/development/docker-compose.yml up \
  --menu=false \
  --abort-on-container-exit \
  --exit-code-from rbportal-mount
