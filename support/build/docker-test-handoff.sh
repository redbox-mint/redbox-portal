#!/usr/bin/env bash
set -euo pipefail

action="${1:?expected publish or receive}"
directory="${2:-/tmp/docker-images}"
metadata="$directory/test-image.txt"
archive="$directory/redbox-portal-test.tar"
valid_checksum() { [[ "$1" =~ ^sha256:[a-f0-9]{64}$ ]]; }
# Hash the saved artifact: Docker's .Id changes meaning across storage backends,
# and imported classic archives do not carry a config.digest annotation.
archive_checksum() {
  local checksum
  checksum="$(sha256sum "$archive")"
  printf 'sha256:%s\n' "${checksum%% *}"
}

case "$action" in
  publish)
    mkdir -p "$directory"
    # A failed retry must not leave stale metadata identifying an earlier archive.
    rm -f "$metadata" "$archive"
    # Runtime layers are already in test; branch test jobs need only this tag.
    images=(redbox-portal:test)
    # Preserve the pristine runtime tag used by the legacy v* deployment job.
    if [[ "${CIRCLE_TAG:-}" == v* ]]; then images+=(redbox-portal:runtime); fi
    start=$SECONDS
    docker save -o "$archive" "${images[@]}"
    echo "Workspace image save seconds: $((SECONDS - start))"
    archive_checksum >"$metadata"
    echo "Build tested archive checksum: $(cat "$metadata")"
    ;;
  receive)
    # Read data, never source workspace metadata as executable shell code.
    mapfile -t fields <"$metadata"
    [[ "${#fields[@]}" == 1 ]] && valid_checksum "${fields[0]}" || { echo 'Invalid expected test archive checksum' >&2; exit 1; }
    expected_checksum="${fields[0]}"
    actual="$(archive_checksum)"
    [[ "$actual" == "$expected_checksum" ]] || { echo "Test archive checksum mismatch: expected $expected_checksum, received $actual" >&2; exit 1; }
    echo "Verified tested archive checksum: $actual"
    start=$SECONDS
    docker load -i "$archive"
    echo "Test image load seconds: $((SECONDS - start))"
    ;;
  *) echo 'Expected publish or receive' >&2; exit 1 ;;
esac
