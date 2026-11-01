#!/usr/bin/env bash
set -euo pipefail

action="${1:?expected publish or receive}"
directory="${2:-/tmp/docker-images}"
metadata="$directory/test-image.txt"
archive="$directory/redbox-portal-test.tar"
valid_id() { [[ "$1" =~ ^sha256:[a-f0-9]{64}$ ]]; }

case "$action" in
  publish)
    mkdir -p "$directory"
    # A failed retry must not leave stale metadata identifying an earlier archive.
    rm -f "$metadata" "$archive"
    tested_id="$(docker image inspect --format '{{.Id}}' redbox-portal:test)"
    valid_id "$tested_id" || { echo 'Invalid tested image ID' >&2; exit 1; }
    echo "Build tested image ID: $tested_id"
    # Runtime layers are already in test; branch test jobs need only this tag.
    images=(redbox-portal:test)
    # Preserve the pristine runtime tag used by the legacy v* deployment job.
    if [[ "${CIRCLE_TAG:-}" == v* ]]; then images+=(redbox-portal:runtime); fi
    start=$SECONDS
    docker save -o "$archive" "${images[@]}"
    echo "Workspace image save seconds: $((SECONDS - start))"
    printf '%s\n' "$tested_id" >"$metadata"
    ;;
  receive)
    # Read data, never source workspace metadata as executable shell code.
    mapfile -t fields <"$metadata"
    [[ "${#fields[@]}" == 1 ]] && valid_id "${fields[0]}" || { echo 'Invalid expected test image ID' >&2; exit 1; }
    tested_id="${fields[0]}"
    start=$SECONDS
    docker load -i "$archive"
    echo "Test image load seconds: $((SECONDS - start))"
    actual="$(docker image inspect --format '{{.Id}}' redbox-portal:test)"
    [[ "$actual" == "$tested_id" ]] || { echo "Test image identity mismatch: expected $tested_id, received $actual" >&2; exit 1; }
    echo "Verified tested image ID: $actual"
    ;;
  *) echo 'Expected publish or receive' >&2; exit 1 ;;
esac
