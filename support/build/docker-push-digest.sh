#!/usr/bin/env bash
# Run only after auditing the local platform image. Read the registry digest
# from this push itself; a later tag lookup can observe a different image.
set -euo pipefail

image="${1:?platform image tag is required}"
receipt="${2:?digest receipt path is required}"
mkdir -p "$(dirname "$receipt")"
rm -f "$receipt"
output="$(mktemp "${receipt}.XXXXXX")"
trap 'rm -f "$output"' EXIT

if ! docker push "$image" 2>&1 | tee "$output"; then
  exit 1
fi
digest="$(awk -v tag="${image##*:}:" '$1 == tag && $2 == "digest:" && $4 == "size:" { sub(/,$/, "", $3); print $3 }' "$output")"
if [[ ! "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  printf 'No unique registry digest in successful push output for %s\n' "$image" >&2
  exit 1
fi
printf '%s %s\n' "$image" "$digest" > "$output"
mv "$output" "$receipt"
