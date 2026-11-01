#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/docker-build-vars.sh"

action="${1:?expected publish or receive}"
directory="${2:-/tmp/docker-images}"
metadata="$directory/test-image.txt"
archive="$directory/redbox-portal-test.tar"
valid_digest() { [[ "$1" =~ ^sha256:[a-f0-9]{64}$ ]]; }
has_credentials() { [[ -n "${DOCKER_USER:-}" && -n "${DOCKER_PASS:-}" ]]; }
login() { echo "${DOCKER_PASS:?}" | docker login --username "${DOCKER_USER:?}" --password-stdin; }
verify_id() {
  local actual
  actual="$(docker image inspect --format '{{.Id}}' "$1")"
  [[ "$actual" == "$tested_id" ]] || { echo "Test image identity mismatch: expected $tested_id, received $actual" >&2; exit 1; }
  echo "Verified tested image ID: $actual"
}

case "$action" in
  publish)
    mkdir -p "$directory"
    # Never leave a previous successful hand-off available after a failed retry.
    rm -f "$metadata" "$archive"
    tested_id="$(docker image inspect --format '{{.Id}}' redbox-portal:test)"
    valid_digest "$tested_id" || { echo 'Invalid tested image ID' >&2; exit 1; }
    echo "Build tested image ID: $tested_id"
    transport=workspace
    pinned=-
    if has_credentials; then
      [[ "${CIRCLE_SHA1:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected full CIRCLE_SHA1' >&2; exit 1; }
      [[ "${STAGING_RUN_ID:-}" =~ ^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$ ]] || { echo 'Expected pipeline UUID' >&2; exit 1; }
      login
      image="${REPO}:ci-staging-${CIRCLE_SHA1}-test-amd64-${STAGING_RUN_ID}"
      inspection_error="$(mktemp)"
      trap 'rm -f "$inspection_error"' EXIT
      # Only a definite absent manifest permits a push. Reruns cannot replace tags.
      if docker manifest inspect "$image" >/dev/null 2>"$inspection_error"; then
        echo "Reusing immutable test staging tag: $image"
      elif grep -Eqi 'no such manifest|manifest unknown|manifest_unknown' "$inspection_error"; then
        docker tag redbox-portal:test "$image"
        start=$SECONDS
        docker push "$image"
        echo "Test image push seconds: $((SECONDS - start))"
      else
        cat "$inspection_error" >&2
        exit 1
      fi
      digest="$(docker buildx imagetools inspect --format '{{json .Manifest}}' "$image" |
        node -e 'console.log(JSON.parse(require("node:fs").readFileSync(0, "utf8")).digest)')"
      valid_digest "$digest" || { echo 'Invalid test manifest digest' >&2; exit 1; }
      pinned="${REPO}@${digest}"
      config_id="$(docker buildx imagetools inspect --raw "$pinned" |
        node -e 'console.log(JSON.parse(require("node:fs").readFileSync(0, "utf8")).config?.digest)')"
      [[ "$config_id" == "$tested_id" ]] || { echo 'Pinned test manifest config differs from tested image ID' >&2; exit 1; }
      echo "Test image hand-off: $image -> $pinned ($tested_id)"
      transport=registry
    elif [[ "${CIRCLE_BRANCH:-}" =~ ^(master|develop|support/.*)$ ]]; then
      echo 'Docker credentials are required on release branches' >&2
      exit 1
    else
      echo 'Docker credentials unavailable: using fork workspace hand-off'
    fi
    # v* deploy still loads the pristine runtime from this legacy archive path.
    # Branch tests need only test; runtime layers are already included in test.
    images=()
    if [[ "$transport" == workspace ]]; then images+=(redbox-portal:test); fi
    if [[ "${CIRCLE_TAG:-}" == v* ]]; then images+=(redbox-portal:runtime); fi
    if ((${#images[@]})); then
      start=$SECONDS
      docker save -o "$archive" "${images[@]}"
      echo "Workspace image save seconds: $((SECONDS - start))"
    fi
    printf '%s\n' "$transport" "$tested_id" "$pinned" >"$metadata"
    ;;
  receive)
    # Data only, never source workspace metadata as executable shell code.
    mapfile -t fields <"$metadata"
    [[ "${#fields[@]}" == 3 ]] || { echo 'Invalid test hand-off metadata' >&2; exit 1; }
    transport="${fields[0]}"; tested_id="${fields[1]}"; pinned="${fields[2]}"
    valid_digest "$tested_id" || { echo 'Invalid expected test image ID' >&2; exit 1; }
    case "$transport" in
      registry)
        [[ "$pinned" == "$REPO@"* ]] && valid_digest "${pinned#"$REPO@"}" || { echo 'Expected repository pinned by digest' >&2; exit 1; }
        # Credentials were available to publish: require authenticated pulls too.
        has_credentials || { echo 'Docker credentials required for registry hand-off' >&2; exit 1; }
        login
        start=$SECONDS
        docker pull "$pinned"
        echo "Test image pull seconds: $((SECONDS - start))"
        verify_id "$pinned"
        docker tag "$pinned" redbox-portal:test
        ;;
      workspace)
        [[ "$pinned" == - ]] || { echo 'Invalid workspace hand-off reference' >&2; exit 1; }
        start=$SECONDS
        docker load -i "$archive"
        echo "Test image load seconds: $((SECONDS - start))"
        ;;
      *) echo 'Unknown test image hand-off transport' >&2; exit 1 ;;
    esac
    verify_id redbox-portal:test
    ;;
  *) echo 'Expected publish or receive' >&2; exit 1 ;;
esac
