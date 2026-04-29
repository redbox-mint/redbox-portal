#!/usr/bin/env bash
set -euo pipefail

readonly STAGING_ROOT="${NPM_PUBLISH_STAGING_ROOT:-/tmp/redbox-npm-publish}"
readonly RELEASE_KIND="${NPM_RELEASE_KIND:-}"
readonly REQUESTED_VERSION="${NPM_PUBLISH_VERSION:-}"
readonly DIST_TAG="${NPM_DIST_TAG:-latest}"
readonly DRY_RUN="${NPM_PUBLISH_DRY_RUN:-false}"
readonly REQUIRED_NPM_VERSION="11.5.1"
readonly PIPELINE_NUMBER="${CIRCLE_PIPELINE_NUMBER:-${CIRCLE_BUILD_NUM:-}}"

readonly PACKAGE_PATHS=(
  "packages/raido"
  "packages/rva-registry"
  "packages/sails-ng-common"
  "packages/redbox-core"
  "packages/sails-hook-redbox-storage-mongo"
  "packages/redbox-dev-tools"
)

readonly INTERNAL_PACKAGES=(
  "@researchdatabox/raido-openapi-generated-node"
  "@researchdatabox/rva-registry-openapi-generated-node"
  "@researchdatabox/sails-ng-common"
  "@researchdatabox/redbox-core"
  "@researchdatabox/sails-hook-redbox-storage-mongo"
  "@researchdatabox/redbox-dev-tools"
)

log() {
  printf '[npm-publish] %s\n' "$*"
}

fail() {
  printf '[npm-publish] ERROR: %s\n' "$*" >&2
  exit 1
}

version_ge() {
  local current="$1"
  local required="$2"

  local current_major current_minor current_patch
  local required_major required_minor required_patch
  IFS=. read -r current_major current_minor current_patch <<< "$current"
  IFS=. read -r required_major required_minor required_patch <<< "$required"

  current_patch="${current_patch%%-*}"
  required_patch="${required_patch%%-*}"

  if (( current_major > required_major )); then return 0; fi
  if (( current_major < required_major )); then return 1; fi
  if (( current_minor > required_minor )); then return 0; fi
  if (( current_minor < required_minor )); then return 1; fi
  (( current_patch >= required_patch ))
}

validate_inputs() {
  local npm_version
  npm_version="$(npm --version)"
  if ! version_ge "$npm_version" "$REQUIRED_NPM_VERSION"; then
    fail "npm $REQUIRED_NPM_VERSION or newer is required for trusted publishing; found $npm_version."
  fi

  case "$RELEASE_KIND" in
    beta)
      [[ "$REQUESTED_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
        || fail "NPM_PUBLISH_VERSION must be a stable semver base like 2.2.0 for beta publishes."
      [[ "$DIST_TAG" =~ ^(beta|next|alpha)$ ]] \
        || fail "NPM_DIST_TAG must be beta, next, or alpha for beta publishes."
      [[ -n "$PIPELINE_NUMBER" ]] \
        || fail "CIRCLE_PIPELINE_NUMBER or CIRCLE_BUILD_NUM is required to generate beta package versions."
      ;;
    release)
      [[ "${CIRCLE_TAG:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] \
        || fail "CIRCLE_TAG must match vMAJOR.MINOR.PATCH for release publishes."
      [[ "$DIST_TAG" == "latest" ]] \
        || fail "Release publishes must use the latest dist-tag."
      ;;
    *)
      fail "NPM_RELEASE_KIND must be beta or release."
      ;;
  esac

  if [[ "$DRY_RUN" != "true" && -z "${NPM_ID_TOKEN:-}" ]]; then
    fail "NPM_ID_TOKEN is required unless NPM_PUBLISH_DRY_RUN=true."
  fi
}

final_version() {
  case "$RELEASE_KIND" in
    beta)
      printf '%s-%s.%s\n' "$REQUESTED_VERSION" "$DIST_TAG" "$PIPELINE_NUMBER"
      ;;
    release)
      printf '%s\n' "${CIRCLE_TAG#v}"
      ;;
  esac
}

build_packages() {
  log "Building backend packages in dependency order."
  npm run compile:raido
  npm run compile:rva
  npm run compile:sails-ng-common
  npm run compile:core
  npm run compile:storage-mongo
  npm run compile:dev-tools
}

stage_packages() {
  local version="$1"

  rm -rf "$STAGING_ROOT"
  mkdir -p "$STAGING_ROOT"

  for package_path in "${PACKAGE_PATHS[@]}"; do
    mkdir -p "$STAGING_ROOT/$(dirname "$package_path")"
    cp -R "$package_path" "$STAGING_ROOT/$package_path"
    rm -rf "$STAGING_ROOT/$package_path/node_modules"
  done

  log "Rewriting staged package metadata for version $version."
  node - "$STAGING_ROOT" "$version" "${INTERNAL_PACKAGES[@]}" <<'NODE'
const fs = require('fs');
const path = require('path');

const [stagingRoot, version, ...internalPackages] = process.argv.slice(2);
const packagePaths = [
  'packages/raido',
  'packages/rva-registry',
  'packages/sails-ng-common',
  'packages/redbox-core',
  'packages/sails-hook-redbox-storage-mongo',
  'packages/redbox-dev-tools',
];

function rewriteDependencyBlock(pkg, blockName) {
  const block = pkg[blockName];
  if (!block) return;

  for (const packageName of internalPackages) {
    if (Object.prototype.hasOwnProperty.call(block, packageName)) {
      block[packageName] = version;
    }
  }
}

for (const packagePath of packagePaths) {
  const packageJsonPath = path.join(stagingRoot, packagePath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  pkg.version = version;
  pkg.publishConfig = {
    ...(pkg.publishConfig || {}),
    access: 'public',
    registry: 'https://registry.npmjs.org/',
    provenance: false,
  };

  for (const blockName of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    rewriteDependencyBlock(pkg, blockName);
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
NODE
}

package_name() {
  node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).name)" "$1/package.json"
}

package_version() {
  node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).version)" "$1/package.json"
}

assert_no_staged_file_dependencies() {
  local package_path
  for package_path in "${PACKAGE_PATHS[@]}"; do
    if grep -R '"file:' "$STAGING_ROOT/$package_path/package.json" >/dev/null; then
      fail "Staged $package_path/package.json still contains a file: dependency."
    fi
  done
}

assert_versions_not_published() {
  local version="$1"
  local package_path package_name view_error view_output status

  log "Checking npm registry for existing $version package versions."
  for package_path in "${PACKAGE_PATHS[@]}"; do
    package_name="$(package_name "$STAGING_ROOT/$package_path")"
    view_output="$(mktemp)"
    view_error="$(mktemp)"
    status=0
    npm view "$package_name@$version" version --silent >"$view_output" 2>"$view_error" || status=$?
    if [[ "$status" -eq 0 ]]; then
      cat "$view_output"
      rm -f "$view_output" "$view_error"
      fail "$package_name@$version already exists on npm."
    fi
    if [[ ! -s "$view_output" && ! -s "$view_error" ]]; then
      rm -f "$view_error"
      rm -f "$view_output"
      continue
    fi
    if ! grep -Eq '(E404|404 Not Found|No match found|not found)' "$view_error"; then
      cat "$view_output" >&2
      cat "$view_error" >&2
      rm -f "$view_output" "$view_error"
      fail "Unable to determine whether $package_name@$version already exists."
    fi
    rm -f "$view_output" "$view_error"
  done
}

pack_dry_run() {
  local package_path package_name version

  log "Running npm pack --dry-run for staged packages."
  for package_path in "${PACKAGE_PATHS[@]}"; do
    package_name="$(package_name "$STAGING_ROOT/$package_path")"
    version="$(package_version "$STAGING_ROOT/$package_path")"
    log "Packing $package_name@$version."
    (cd "$STAGING_ROOT/$package_path" && npm pack --dry-run)
  done
}

publish_packages() {
  local package_path package_name version

  if [[ "$DRY_RUN" == "true" ]]; then
    log "NPM_PUBLISH_DRY_RUN=true; skipping npm publish."
    return
  fi

  log "Publishing staged backend packages with dist-tag $DIST_TAG."
  for package_path in "${PACKAGE_PATHS[@]}"; do
    package_name="$(package_name "$STAGING_ROOT/$package_path")"
    version="$(package_version "$STAGING_ROOT/$package_path")"
    log "Publishing $package_name@$version."
    (cd "$STAGING_ROOT/$package_path" && npm publish --access public --tag "$DIST_TAG")
  done
}

main() {
  validate_inputs

  local version
  version="$(final_version)"
  log "Preparing $RELEASE_KIND publish for backend package version $version with dist-tag $DIST_TAG."

  build_packages
  stage_packages "$version"
  assert_no_staged_file_dependencies
  assert_versions_not_published "$version"
  pack_dry_run
  publish_packages

  log "Completed $RELEASE_KIND publish preparation for version $version."
}

main "$@"
