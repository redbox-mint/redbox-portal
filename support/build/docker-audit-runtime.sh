#!/usr/bin/env bash
set -euo pipefail

image="${1:?locally built runtime image is required}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
timeout --kill-after=20s 1200s node "${script_dir}/../tooling/fastify-retirement/runtime-image-audit.cjs" "${image}"
