#!/usr/bin/env bash
# Run the unchanged packed consumer over a clean committed build without
# exporting the builder's large development dependency tree as a Docker image.
set -euo pipefail
cd "$(dirname "$0")/../.."
node --eval 'require("node:assert/strict").equal(process.version, "v26.12.1")'
task_context=${SR_P7_CLEAN_CONTEXT:?Set the clean git-archive build context}
task_output=${SR_P7_PACKED_OUTPUT:?Set a new output directory for packed qualification}
[[ -f "$task_context/Dockerfile" && -f "$task_context/package-lock.json" ]]
[[ ! -e "$task_output" ]]
task_temporary=$(mktemp -d)
trap 'rm -rf "$task_temporary"' EXIT
cat "$task_context/Dockerfile" > "$task_temporary/Dockerfile"
cat >> "$task_temporary/Dockerfile" <<'DOCKERFILE'

FROM builder AS packed_qualification
ENV npm_config_strict_peer_deps=true npm_config_legacy_peer_deps=false
RUN node packages/redbox-core/test/extensions/run-packed.cjs

FROM scratch AS packed_results
COPY --from=packed_qualification /opt/redbox-portal/.tmp/sails-retirement/p2-pack/ /
DOCKERFILE
docker build --network host --progress plain --file "$task_temporary/Dockerfile" \
  --target packed_results --output "type=local,dest=$task_output" "$task_context"
node --eval 'const assert = require("node:assert/strict"); const result = require(process.argv[1]); assert.equal(result.artifacts.length, 12); assert.equal(result.result.checks, 20); console.log(JSON.stringify(result));' "$task_output/result.json"
