#!/usr/bin/env bash
set -euo pipefail
# Run on a CircleCI machine, never on the small development host. Compare the
# old Dockerfile and new Dockerfile against the SAME source checkout and bases.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p /tmp/image-equivalence
source "$SCRIPT_DIR/docker-build-vars.sh"
source "$SCRIPT_DIR/docker-build-cache.sh"
arch=amd64
setup_build_cache
# Build/export one graph at a time to bound memory and disk use.
for implementation in old new; do
  dockerfile=Dockerfile
  if [[ "$implementation" == old ]]; then dockerfile=support/build/Dockerfile.before-cache; fi
  args=(--set "*.dockerfile=$dockerfile" --set '*.platform=linux/amd64' --set '*.attest=type=provenance,disabled=true')
  if [[ "$implementation" == new ]]; then
    for ((i=1; i<${#CACHE_FROM[@]}; i+=2)); do args+=(--set "*.cache-from+=${CACHE_FROM[i]}"); done
  fi
  docker buildx bake -f support/build/docker-bake.hcl --progress plain "${args[@]}"
  for target in runtime test; do
    docker run --rm -i --entrypoint node "redbox-portal:$target" <"$SCRIPT_DIR/image-inventory.cjs" >"/tmp/image-equivalence/$implementation-$target.inventory.jsonl"
    # Preserve both stdout and exit status: baseline npm ls may expose existing
    # invalid/extraneous local-package edges; compare that evidence as well.
    status=0
    docker run --rm --entrypoint npm "redbox-portal:$target" ls --all --omit=dev --json >"/tmp/image-equivalence/$implementation-$target.npm-ls.json" 2>"/tmp/image-equivalence/$implementation-$target.npm-ls.stderr" || status=$?
    echo "$status" >"/tmp/image-equivalence/$implementation-$target.npm-ls.status"
  done
  docker image rm redbox-portal:runtime redbox-portal:test
  # Old images aren't needed again; release their large snapshots before new.
  if [[ "$implementation" == old ]]; then docker buildx prune --all --force; fi
done
result=0
for target in runtime test; do
  for evidence in inventory.jsonl npm-ls.json npm-ls.status; do
    diff -u "/tmp/image-equivalence/old-$target.$evidence" "/tmp/image-equivalence/new-$target.$evidence" >"/tmp/image-equivalence/$target.$evidence.diff" || result=1
  done
done
if ((result)); then echo 'Image differences detected; see image-equivalence artifacts'; fi
exit "$result"
