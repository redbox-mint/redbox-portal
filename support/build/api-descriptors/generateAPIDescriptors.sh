#! /bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR/../../.."

npm run doc:api -- --branding=default --portal=rdmp
