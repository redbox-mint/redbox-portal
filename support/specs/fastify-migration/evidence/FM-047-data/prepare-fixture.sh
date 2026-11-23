#!/usr/bin/env bash
set -euo pipefail

adapter=${1:?supply a new benchmark adapter directory}
archive=${2:?supply the verified FM-007 raw telemetry archive}
hook=${3:?supply the FM-044 r4 redbox-hook-dev tarball}
evidence=$(cd -- "$(dirname -- "$0")" && pwd)
repository=$(git -C "$evidence" rev-parse --show-toplevel)
harness="$repository/support/integration-testing/fastify-performance"

printf '%s  %s\n' \
  f2909d4f58bbf40df66c357175544d9f8eae5a2067f92d58ce6b9ca9c02d69d3 "$archive" \
  70c25fb2a7654f751f8d65271de3732516155911ec5ff5c1a6d6e036daaeaae0 "$hook" |
  timeout 30 sha256sum -c
mkdir "$adapter"
mkdir "$adapter/express-snapshot" "$adapter/hook"
timeout 30 tar -xzf "$archive" -C "$adapter/express-snapshot" --strip-components=1 measured-harness
timeout 30 tar -xzf "$hook" -C "$adapter/hook" --strip-components=1
cp "$harness/"{protocol,client,application,state,run}.cjs "$harness/nginx.conf" "$adapter/"
for fixed in protocol.cjs client.cjs application.cjs nginx.conf; do
  cmp "$adapter/$fixed" "$adapter/express-snapshot/$fixed"
done
ln -s "$repository/node_modules" "$adapter/node_modules"
patch --batch -o "$adapter/candidate-control.cjs" "$adapter/express-snapshot/owner.cjs" "$evidence/candidate-control.patch"
patch --batch -o "$adapter/sample.cjs" "$harness/sample.cjs" "$evidence/sample.patch"
patch --batch -o "$adapter/profile-control.cjs" "$adapter/candidate-control.cjs" "$evidence/profile-control.patch"
patch --batch -o "$adapter/profile-sample.cjs" "$adapter/sample.cjs" "$evidence/profile-sample.patch"
