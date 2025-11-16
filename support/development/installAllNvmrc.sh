#!/usr/bin/env bash
set -euo pipefail

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm not found. Please install nvm and/or set NVM_DIR." >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"

search_root="${1:-.}"

find "$search_root" -name .nvmrc -not -path "*/node_modules/*" -print0 | while IFS= read -r -d '' rcfile; do
  dir=$(dirname "$rcfile")
  echo "Installing Node version defined in $rcfile"
  (cd "$dir" && nvm install)
done

root_nvmrc="$search_root/.nvmrc"
if [[ -f "$root_nvmrc" ]]; then
  echo "Switching to Node version defined in $root_nvmrc"
  (cd "$search_root" && nvm use)
fi
