#! /bin/bash
# Convenience wrapper for Angular tests
# Requires setup and compilation of angular apps before running.

set -euo pipefail

function testAngular() {
  echo "-------------------------------------------"
  echo "Testing ${1} (${2})"
  echo "-------------------------------------------"
  # Some CI-style environments need the no-sandbox launcher even when not running as root.
  local browser="ChromeHeadless"
  if [ "$(id -u)" -eq 0 ] || [ "${CI:-}" = "true" ] || [ "${CODEX_CI:-}" = "1" ]; then
    browser="ChromeHeadlessNoSandbox"
  fi
  node_modules/.bin/ng t --browsers="${browser}" "@researchdatabox/${1}" --no-watch --no-progress --code-coverage
  # Each application can leave hundreds of MB in Angular's persistent cache.
  # Clear it between projects so the complete suite also runs on constrained CI disks.
  node_modules/.bin/ng cache clean
}

export NVM_DIR="$HOME/.nvm"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd angular
nvm install
nvm use
npm install --include=dev --include=optional --ignore-scripts --strict-peer-deps

# Karma's Chrome launcher honours CHROME_BIN. Development agents commonly have
# Playwright's Chromium available even when no system Chrome package is installed.
if [ -z "${CHROME_BIN:-}" ]; then
  CHROME_BIN="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
  if [ -z "$CHROME_BIN" ] && [ -d "$HOME/.cache/ms-playwright" ]; then
    CHROME_BIN="$(find "$HOME/.cache/ms-playwright" -type f \( -path '*/chrome-linux*/chrome' -o -path '*/chrome-headless-shell-linux*/chrome-headless-shell' \) | sort -r | head -n 1)"
  fi
  export CHROME_BIN
fi

if [ $# -ne 0 ]; then
  if [ "${1}" == "portal-ng-common" ]; then
      testAngular "portal-ng-common" "frontend-core-lib"
  else
    testAngular "${1}" "frontend-${1}"
  fi
else
  testAngular "portal-ng-common" "frontend-core-lib"
  ng2apps=( $(find ./projects/researchdatabox -maxdepth 1 -mindepth 1 -type d -exec basename {} \;) )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "portal-ng-common" ] && [ "$ng2app" != "portal-ng-form-custom" ]; then
      testAngular "${ng2app}" "frontend-${ng2app}"
    fi
  done
fi
