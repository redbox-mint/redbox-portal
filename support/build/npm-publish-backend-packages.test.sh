#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/npm-publish-backend-packages.sh"

assert_equal() {
  local expected="$1"
  local actual="$2"
  local description="$3"

  if [[ "$actual" != "$expected" ]]; then
    printf 'FAIL: %s (expected %s, got %s)\n' "$description" "$expected" "$actual" >&2
    exit 1
  fi
}

assert_validates() {
  local release_kind="$1"
  local tag="$2"
  local dist_tag="$3"

  env \
    NPM_RELEASE_KIND="$release_kind" \
    CIRCLE_TAG="$tag" \
    NPM_DIST_TAG="$dist_tag" \
    NPM_PUBLISH_DRY_RUN=true \
    bash -c 'source "$1"; validate_inputs' bash "$SCRIPT_PATH"
}

assert_rejects() {
  local release_kind="$1"
  local tag="$2"
  local dist_tag="$3"

  if assert_validates "$release_kind" "$tag" "$dist_tag" 2>/dev/null; then
    printf 'FAIL: expected validation to reject %s\n' "$tag" >&2
    exit 1
  fi
}

rc_version="$({
  env \
    NPM_RELEASE_KIND=rc \
    CIRCLE_TAG=v5.0.0-RC1 \
    NPM_DIST_TAG=next \
    NPM_PUBLISH_DRY_RUN=true \
    bash -c 'source "$1"; final_version' bash "$SCRIPT_PATH"
})"
assert_equal "5.0.0-RC1" "$rc_version" "RC tag is converted to the npm package version"

stable_version="$({
  env \
    NPM_RELEASE_KIND=release \
    CIRCLE_TAG=v5.0.0 \
    NPM_DIST_TAG=latest \
    NPM_PUBLISH_DRY_RUN=true \
    bash -c 'source "$1"; final_version' bash "$SCRIPT_PATH"
})"
assert_equal "5.0.0" "$stable_version" "stable tag keeps the stable package version"

assert_validates rc v5.0.0-RC1 next
assert_validates release v5.0.0 latest
assert_rejects rc v5.0-RC1 next
assert_rejects rc v5.0.0-RC1 latest
assert_rejects release v5.0.0-RC1 latest

printf 'npm publish version handling tests passed.\n'

# File dependency patches must survive npm publication, including generated core-types.
publish_test_dir="$(mktemp -d)"
trap 'rm -rf -- "$publish_test_dir"' EXIT
for package_name in redbox-core redbox-core-types agenda-sqs-backend; do
  mkdir -p "$publish_test_dir/packages/$package_name"
  node - "$publish_test_dir/packages/$package_name/package.json" "$package_name" <<'NODE'
const fs = require('fs');
fs.writeFileSync(process.argv[2], JSON.stringify({
  name: `@researchdatabox/${process.argv[3]}`, version: '0.0.0', files: ['dist'],
  [process.argv[3] === 'agenda-sqs-backend' ? 'devDependencies' : 'dependencies']:
    { agenda: 'file:../agenda-patched/agenda-6.2.5-redbox.1.tgz' }
}));
NODE
done
NPM_PUBLISH_STAGING_ROOT="$publish_test_dir" bash -c 'source "$1"; bundle_patched_agenda' bash "$SCRIPT_PATH"
for package_name in redbox-core redbox-core-types; do
  npm pack "$publish_test_dir/packages/$package_name" --ignore-scripts --pack-destination "$publish_test_dir" --silent >/dev/null
  tar -xOf "$publish_test_dir/researchdatabox-$package_name-0.0.0.tgz" package/node_modules/agenda/dist/JobProcessor.js \
    | grep 'watchdog.abort()' >/dev/null
  tar -xOf "$publish_test_dir/researchdatabox-$package_name-0.0.0.tgz" \
    package/node_modules/agenda/node_modules/cron-parser/package.json | grep '"5.5.0"' >/dev/null
  node - "$publish_test_dir/packages/$package_name/package.json" <<'NODE'
const assert = require('assert/strict');
const pkg = require(process.argv[2]);
assert.equal(pkg.dependencies.agenda, '6.2.5');
assert(pkg.bundleDependencies.includes('agenda'));
NODE
done
printf 'Patched Agenda is bundled in both published core packages.\n'
