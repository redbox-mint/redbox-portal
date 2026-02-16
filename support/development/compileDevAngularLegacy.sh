#! /bin/bash
set -euo pipefail
function buildAngularApp() {
  echo "-------------------------------------------"
  echo "Building angular legacy app ${1}"
  echo "-------------------------------------------"
  NG_BUILD_PREFIX=""
  if [ -n "${NG_BUILD_TEMP_OUTPUT:-}" ]  && [ -z "${2:-}" ]; then
    NG_BUILD_PREFIX="--output-path=${NG_BUILD_TEMP_OUTPUT}/${1}"
  fi
  (node_modules/.bin/ng build $NG_BUILD_PREFIX --app=${1}) 
}

export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
SCRIPT_PATH="$0"
if [[ "$SCRIPT_PATH" != /* ]]; then
  SCRIPT_PATH="$(pwd)/$SCRIPT_PATH"
fi
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LEGACY_DIR="$ROOT_DIR/angular-legacy"
NVM_VERSION="$(tr -d '[:space:]' < "$LEGACY_DIR/.nvmrc")"
# nvm does not support partial major.minor selectors reliably.
if [ "$NVM_VERSION" = "14.19" ]; then
  NVM_VERSION="14.19.3"
fi

# Node 14 on Apple Silicon is more reliable through Rosetta/x64 binaries.
if [ "${RB_LEGACY_FORCE_X64:-}" != "1" ] && [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ] && [[ "$NVM_VERSION" =~ ^14\. ]]; then
  if command -v arch >/dev/null 2>&1; then
    export RB_LEGACY_FORCE_X64=1
    exec arch -x86_64 bash "$SCRIPT_PATH" "$@"
  fi
fi

cd "$LEGACY_DIR"

nvm install "$NVM_VERSION"
nvm use "$NVM_VERSION"
npm install --legacy-peer-deps

if [ $# -ne 0 ]
  then
    buildAngularApp "$1"
else 
  ng2apps=( $(find ./ -maxdepth 1 -mindepth 1 -type d -exec basename {} \;) )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "shared" ]; then
      if [ "$ng2app" != "e2e" ]; then
        if [ "$ng2app" != "node_modules" ] && [ "$ng2app" != "localAuth" ]; then
          buildAngularApp "${ng2app}"
        fi
      fi
    fi
  done
fi
