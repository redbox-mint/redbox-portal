#!/usr/bin/env bash
set -euo pipefail

action="${1:?expected publish or receive}"
directory="${2:-/tmp/docker-images}"
metadata="$directory/test-image.txt"
archive="$directory/redbox-portal-test.tar"
verifier="$(dirname "${BASH_SOURCE[0]}")/docker-test-handoff.py"

case "$action" in
  publish)
    mkdir -p "$directory"
    # A failed retry must not leave stale metadata identifying an earlier archive.
    rm -f "$metadata" "$metadata.tmp" "$archive"
    trap 'rm -f "$metadata.tmp"' EXIT
    # Runtime layers are already in test; branch test jobs need only this tag.
    images=(redbox-portal:test)
    # Preserve the pristine runtime tag used by the legacy v* deployment job.
    if [[ "${CIRCLE_TAG:-}" == v* ]]; then images+=(redbox-portal:runtime); fi
    start=$SECONDS
    docker save -o "$archive" "${images[@]}"
    echo "Workspace image save seconds: $((SECONDS - start))"
    # Image IDs mean config digests in the classic store, but manifest/index
    # digests in the containerd store. Anchor the handoff to the saved bytes.
    docker image inspect redbox-portal:test | python3 "$verifier" publish "$archive" >"$metadata.tmp"
    mv "$metadata.tmp" "$metadata"
    ;;
  receive)
    # Verify the archive before giving it to Docker, then verify the loaded tag.
    python3 "$verifier" verify-archive "$archive" "$metadata"
    start=$SECONDS
    docker load -i "$archive"
    echo "Test image load seconds: $((SECONDS - start))"
    docker image inspect redbox-portal:test | python3 "$verifier" verify-image "$archive" "$metadata"
    ;;
  *) echo 'Expected publish or receive' >&2; exit 1 ;;
esac
