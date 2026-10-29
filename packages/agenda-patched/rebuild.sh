#!/usr/bin/env bash
# Reproduce the dependency artifact without running upstream lifecycle scripts.
set -euo pipefail
patch_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
build_dir="$(mktemp -d)"
trap 'rm -rf -- "$build_dir"' EXIT
curl --fail --silent --show-error --location \
  https://registry.npmjs.org/agenda/-/agenda-6.2.5.tgz --output "$build_dir/upstream.tgz"
(cd "$build_dir" && echo 'acdd47d10be0a369cc9a9152474a665f425856d8aaf8a6bbae2ae210905b0efb  upstream.tgz' | sha256sum --check)
tar -xzf "$build_dir/upstream.tgz" -C "$build_dir"
(cd "$build_dir/package" && patch --batch --fuzz=0 -p1 < "$patch_dir/watchdog.patch")
npm pack "$build_dir/package" --ignore-scripts --pack-destination "$build_dir" --silent >/dev/null
if [[ "${1:-}" == '--write' ]]; then
  cp "$build_dir/agenda-6.2.5.tgz" "$patch_dir/agenda-6.2.5-redbox.1.tgz"
else
  cmp "$build_dir/agenda-6.2.5.tgz" "$patch_dir/agenda-6.2.5-redbox.1.tgz"
  echo 'Patched artifact matches the reviewed patch.'
fi
