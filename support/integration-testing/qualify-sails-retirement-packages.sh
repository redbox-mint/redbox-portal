#!/usr/bin/env bash
# Historical clean-context entrypoint; use the current Fastify packed gate.
set -euo pipefail
cd "$(dirname "$0")/../.."
node --eval 'require("node:assert/strict").equal(process.version, "v26.12.1")'
task_context=${SR_P7_CLEAN_CONTEXT:?Set the clean git-archive build context}
task_output=${SR_P7_PACKED_OUTPUT:?Set a new output directory for packed qualification}
[[ -f "$task_context/package-lock.json" && -f "$task_context/support/integration-testing/qualify-fastify-packages.cjs" ]]
[[ ! -e "$task_context/node_modules" && ! -e "$task_output" ]]
task_context=$(realpath "$task_context")
task_output=$(realpath -m "$task_output")
task_temporary=$(mktemp -d "${FM039_SCRATCH_PARENT:-$HOME}/fm039-clean-context-XXXXXX")
trap 'rm -rf "$task_temporary"' EXIT
trap 'exit 1' INT TERM
mkdir "$task_temporary/source"
cp -a "$task_context/." "$task_temporary/source/"
cd "$task_temporary/source"
# Source links are allowed only while building. The gate installs tarballs into
# separate external projects and audits every runtime/compiler resolution.
export npm_config_cache="$task_temporary/cache"
export PUPPETEER_SKIP_DOWNLOAD=true
export FM039_OUTPUT="$task_output"
export FM039_SCRATCH_PARENT="$task_temporary"
timeout --signal=TERM --kill-after=20 900 npm ci --ignore-scripts --strict-peer-deps --no-audit --no-fund
timeout --signal=TERM --kill-after=20 2400 node support/integration-testing/qualify-fastify-packages.cjs
node --eval 'const assert = require("node:assert/strict"); const result = require(process.argv[1]); assert.equal(result.packages.length, 14); assert.equal(result.passing, 1); assert.equal(result.failing, 0); console.log(JSON.stringify(result));' "$task_output/result.json"
