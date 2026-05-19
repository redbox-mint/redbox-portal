#!/usr/bin/env bash
set -euo pipefail

STAGING_ROOT="${NPM_PUBLISH_STAGING_ROOT:-/tmp/redbox-npm-publish}"
readonly RELEASE_KIND="${NPM_RELEASE_KIND:-}"
readonly REQUESTED_VERSION="${NPM_PUBLISH_VERSION:-}"
readonly DIST_TAG="${NPM_DIST_TAG:-latest}"
readonly DRY_RUN="${NPM_PUBLISH_DRY_RUN:-false}"
readonly PIPELINE_NUMBER="${CIRCLE_PIPELINE_NUMBER:-}"

readonly PACKAGE_PATHS=(
  "packages/raido"
  "packages/rva-registry"
  "packages/sails-ng-common"
  "packages/agenda-sqs-backend"
  "packages/redbox-core"
  "packages/sails-hook-redbox-storage-mongo"
  "packages/redbox-dev-tools"
)

readonly GENERATED_CORE_TYPES_PACKAGE_PATH="packages/redbox-core-types"

readonly STAGED_PACKAGE_PATHS=(
  "packages/raido"
  "packages/rva-registry"
  "packages/sails-ng-common"
  "packages/agenda-sqs-backend"
  "packages/redbox-core"
  "$GENERATED_CORE_TYPES_PACKAGE_PATH"
  "packages/sails-hook-redbox-storage-mongo"
  "packages/redbox-dev-tools"
)

readonly INTERNAL_PACKAGES=(
  "@researchdatabox/raido-openapi-generated-node"
  "@researchdatabox/rva-registry-openapi-generated-node"
  "@researchdatabox/sails-ng-common"
  "@researchdatabox/agenda-sqs-backend"
  "@researchdatabox/redbox-core"
  "@researchdatabox/redbox-core-types"
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

validate_inputs() {
  case "$RELEASE_KIND" in
    beta)
      [[ "$REQUESTED_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
        || fail "NPM_PUBLISH_VERSION must be a stable semver base like 2.2.0 for beta publishes."
      [[ "$DIST_TAG" =~ ^(beta|next|alpha)$ ]] \
        || fail "NPM_DIST_TAG must be beta, next, or alpha for beta publishes."
      [[ -n "$PIPELINE_NUMBER" ]] \
        || fail "CIRCLE_PIPELINE_NUMBER is required to generate beta package versions."
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
  npm run compile:agenda-sqs
  npm run compile:core
  npm run compile:storage-mongo
  npm run compile:dev-tools
}

stage_packages() {
  local version="$1"

  validate_staging_root
  rm -rf "$STAGING_ROOT"
  mkdir -p "$STAGING_ROOT"

  for package_path in "${PACKAGE_PATHS[@]}"; do
    mkdir -p "$STAGING_ROOT/$(dirname "$package_path")"
    cp -R "$package_path" "$STAGING_ROOT/$package_path"
    rm -rf "$STAGING_ROOT/$package_path/node_modules"
  done

  mkdir -p "$STAGING_ROOT/$(dirname "$GENERATED_CORE_TYPES_PACKAGE_PATH")"
  cp -R "$STAGING_ROOT/packages/redbox-core" "$STAGING_ROOT/$GENERATED_CORE_TYPES_PACKAGE_PATH"

  log "Rewriting staged package metadata for version $version."
  node - "$STAGING_ROOT" "$version" "$GENERATED_CORE_TYPES_PACKAGE_PATH" "${#STAGED_PACKAGE_PATHS[@]}" "${STAGED_PACKAGE_PATHS[@]}" "${INTERNAL_PACKAGES[@]}" <<'NODE'
const fs = require('fs');
const path = require('path');

const [stagingRoot, version, generatedCoreTypesPackagePath, packageCountValue, ...values] = process.argv.slice(2);
const packageCount = Number.parseInt(packageCountValue, 10);
const packagePaths = values.slice(0, packageCount);
const internalPackages = values.slice(packageCount);

function rewriteDependencyBlock(pkg, blockName) {
  const block = pkg[blockName];
  if (!block) return;

  for (const packageName of internalPackages) {
    if (Object.prototype.hasOwnProperty.call(block, packageName)) {
      block[packageName] = version;
    }
  }
}

function applyGeneratedCoreTypesMetadata(pkg) {
  pkg.name = '@researchdatabox/redbox-core-types';
  pkg.dependencies = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  delete pkg.devDependencies;
}

for (const packagePath of packagePaths) {
  const packageJsonPath = path.join(stagingRoot, packagePath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (packagePath === generatedCoreTypesPackagePath) {
    applyGeneratedCoreTypesMetadata(pkg);
  }

  pkg.version = version;
  pkg.publishConfig = {
    ...(pkg.publishConfig || {}),
    access: 'public',
    registry: 'https://registry.npmjs.org/',
  };

  for (const blockName of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    rewriteDependencyBlock(pkg, blockName);
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
NODE
}

validate_staging_root() {
  local resolved
  resolved="$(node -e "console.log(require('path').resolve(process.argv[1]))" "$STAGING_ROOT")"

  if [[ -z "$resolved" || "$resolved" == "/" || "${#resolved}" -lt 10 ]]; then
    fail "Refusing unsafe NPM_PUBLISH_STAGING_ROOT: $STAGING_ROOT"
  fi

  case "$resolved" in
    "$PWD"|"$HOME"|/tmp|/Users|/Users/*/source|/Users/*/source/github)
      fail "Refusing unsafe NPM_PUBLISH_STAGING_ROOT: $resolved"
      ;;
  esac

  STAGING_ROOT="$resolved"
}

package_name() {
  node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).name)" "$1/package.json"
}

package_version() {
  node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).version)" "$1/package.json"
}

assert_no_staged_file_dependencies() {
  local package_path
  for package_path in "${STAGED_PACKAGE_PATHS[@]}"; do
    if grep -R '"file:' "$STAGING_ROOT/$package_path/package.json" >/dev/null; then
      fail "Staged $package_path/package.json still contains a file: dependency."
    fi
  done
}

assert_versions_not_published() {
  local version="$1"
  local attempt package_path package_name view_error view_output status

  log "Checking npm registry for existing $version package versions."
  for package_path in "${STAGED_PACKAGE_PATHS[@]}"; do
    package_name="$(package_name "$STAGING_ROOT/$package_path")"

    for attempt in 1 2 3; do
      view_output="$(mktemp)"
      view_error="$(mktemp)"
      status=0
      npm view "$package_name@$version" version \
        --registry=https://registry.npmjs.org/ \
        --prefer-online >"$view_output" 2>"$view_error" || status=$?
      if [[ "$status" -eq 0 ]]; then
        cat "$view_output"
        rm -f "$view_output" "$view_error"
        fail "$package_name@$version already exists on npm."
      fi
      if grep -Eq '(E404|404 Not Found|No match found|not found)' "$view_error"; then
        rm -f "$view_output" "$view_error"
        break
      fi
      if [[ "$attempt" -eq 3 ]]; then
        cat "$view_output" >&2
        cat "$view_error" >&2
        rm -f "$view_output" "$view_error"
        fail "Unable to determine whether $package_name@$version already exists."
      fi
      rm -f "$view_output" "$view_error"
      sleep "$attempt"
    done
  done
}

pack_dry_run() {
  local package_path package_name version package_dir pack_output_file pack_summary

  log "Running npm pack --dry-run for staged packages."
  for package_path in "${STAGED_PACKAGE_PATHS[@]}"; do
    package_dir="$STAGING_ROOT/$package_path"
    package_name="$(package_name "$package_dir")"
    version="$(package_version "$package_dir")"
    log "Packing $package_name@$version."
    pack_output_file="$(mktemp)"
    (cd "$package_dir" && npm pack --dry-run --json >"$pack_output_file")
    pack_summary="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8'))[0]; console.log([data.filename, data.files.length + ' files', data.size + ' bytes packed', data.unpackedSize + ' bytes unpacked', data.integrity].join(', '))" "$pack_output_file")"
    rm -f "$pack_output_file"
    log "$pack_summary"
  done
}

publish_packages() {
  local package_path package_name version package_dir pack_output_file tarball_filename tarball_path expected_integrity actual_integrity

  if [[ "$DRY_RUN" == "true" ]]; then
    log "NPM_PUBLISH_DRY_RUN=true; skipping npm publish."
    return
  fi

  log "Publishing staged backend packages with dist-tag $DIST_TAG."
  for package_path in "${STAGED_PACKAGE_PATHS[@]}"; do
    package_dir="$STAGING_ROOT/$package_path"
    package_name="$(package_name "$STAGING_ROOT/$package_path")"
    version="$(package_version "$STAGING_ROOT/$package_path")"
    log "Packing $package_name@$version for publish."
    pack_output_file="$(mktemp)"
    (cd "$package_dir" && npm pack --json >"$pack_output_file")
    tarball_filename="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(data[0].filename)" "$pack_output_file")"
    expected_integrity="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(data[0].integrity)" "$pack_output_file")"
    rm -f "$pack_output_file"
    tarball_path="$package_dir/$tarball_filename"

    log "Publishing $package_name@$version from $tarball_filename."
    npm publish "$tarball_path" --access public --tag "$DIST_TAG"

    actual_integrity="$(published_integrity "$package_name" "$version")"
    if [[ "$actual_integrity" != "$expected_integrity" ]]; then
      fail "$package_name@$version registry integrity mismatch. Packed $expected_integrity but registry reports $actual_integrity."
    fi
  done
}

published_integrity() {
  local package_name="$1"
  local version="$2"
  local attempt actual_integrity status

  for attempt in {1..12}; do
    status=0
    actual_integrity="$(npm view "$package_name@$version" dist.integrity \
      --registry=https://registry.npmjs.org/ \
      --prefer-online 2>/dev/null)" || status=$?

    if [[ "$status" -eq 0 && -n "$actual_integrity" ]]; then
      printf '%s\n' "$actual_integrity"
      return 0
    fi

    printf '[npm-publish] Waiting for %s@%s to become readable from npm registry (attempt %s/12).\n' "$package_name" "$version" "$attempt" >&2
    sleep 10
  done

  fail "Unable to read $package_name@$version dist.integrity from npm after publish."
}

main() {
  validate_inputs
  validate_staging_root

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
