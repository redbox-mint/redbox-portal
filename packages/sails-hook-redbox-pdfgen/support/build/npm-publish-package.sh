#!/usr/bin/env bash
set -euo pipefail

readonly RELEASE_KIND="${NPM_RELEASE_KIND:-}"
readonly REQUESTED_VERSION="${NPM_PUBLISH_VERSION:-}"
readonly DIST_TAG="${NPM_DIST_TAG:-latest}"
readonly PIPELINE_NUMBER="${CIRCLE_PIPELINE_NUMBER:-${CIRCLE_BUILD_NUM:-}}"

log() {
  printf '[npm-publish] %s\n' "$*"
}

fail() {
  printf '[npm-publish] ERROR: %s\n' "$*" >&2
  exit 1
}

validate_inputs() {
  case "$RELEASE_KIND" in
    beta)
      [[ "$REQUESTED_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
        || fail "NPM_PUBLISH_VERSION must be a stable semver base like 1.2.3 for beta publishes."
      [[ "$DIST_TAG" =~ ^(beta|next|alpha)$ ]] \
        || fail "NPM_DIST_TAG must be beta, next, or alpha for beta publishes."
      [[ -n "$PIPELINE_NUMBER" ]] \
        || fail "CIRCLE_PIPELINE_NUMBER or CIRCLE_BUILD_NUM is required to generate beta package versions."
      ;;
    rc)
      [[ "${CIRCLE_TAG:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-[Rr][Cc][0-9]+$ ]] \
        || fail "CIRCLE_TAG must match vMAJOR.MINOR.PATCH-RCN for RC publishes."
      [[ "$DIST_TAG" == "next" ]] \
        || fail "RC publishes must use the next dist-tag."
      ;;
    release)
      [[ "${CIRCLE_TAG:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] \
        || fail "CIRCLE_TAG must match vMAJOR.MINOR.PATCH for release publishes."
      [[ "$DIST_TAG" == "latest" ]] \
        || fail "Release publishes must use the latest dist-tag."
      ;;
    *)
      fail "NPM_RELEASE_KIND must be beta, rc, or release."
      ;;
  esac

  [[ -n "${NPM_ID_TOKEN:-}" ]] \
    || fail "NPM_ID_TOKEN is required for npm trusted publishing."
}

final_version() {
  case "$RELEASE_KIND" in
    beta)
      printf '%s-%s.%s\n' "$REQUESTED_VERSION" "$DIST_TAG" "$PIPELINE_NUMBER"
      ;;
    rc|release)
      printf '%s\n' "${CIRCLE_TAG#v}"
      ;;
  esac
}

set_package_version() {
  local version="$1"

  node - "$version" <<'NODE'
const fs = require('fs');

const version = process.argv[2];

function rewriteJsonFile(filePath, update) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  update(json);
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

rewriteJsonFile('package.json', (pkg) => {
  pkg.version = version;
  pkg.publishConfig = {
    ...(pkg.publishConfig || {}),
    access: 'public',
    registry: 'https://registry.npmjs.org/',
  };
});

rewriteJsonFile('package-lock.json', (lockfile) => {
  lockfile.version = version;
  if (lockfile.packages && lockfile.packages['']) {
    lockfile.packages[''].version = version;
  }
});
NODE
}

publish_package() {
  local version="$1"

  log "Preparing @researchdatabox/sails-hook-redbox-pdfgen@$version for publish."
  set_package_version "$version"

  log "Compiling package."
  npm run compile

  log "Publishing package with dist-tag $DIST_TAG."
  npm publish --access public --tag "$DIST_TAG"
}

main() {
  validate_inputs

  local version
  version="$(final_version)"
  log "Using publish version $version."

  publish_package "$version"
}

main "$@"
