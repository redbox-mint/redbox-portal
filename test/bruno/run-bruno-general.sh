#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/bruno-tests

# Install dependencies for running bruno
npm install --ignore-scripts --strict-peer-deps

# Validate the bru syntax
find . -name '*.bru' -type f \
  -prune -not -path "*/node_modules/*" \
  -prune -not -path "**/environments/*" \
  -exec node validate-bruno-files.js '{}' '+'

# Remove the output from any previous run
rm /opt/junit/backend-bruno/backend-bruno-general.xml || true

# Run bruno tests
node_modules/.bin/bru run \
  --disable-cookies --env int-test --format junit --bail \
  --output /opt/junit/backend-bruno/backend-bruno-general.xml

status=$?
wget -qO- http://redboxportal:1599 || true
# If the redbox container aborts while we're sleeping, ensure the script
# exits with the bru process status (stored in $status) instead of the
# signal exit code. Trap TERM/INT to exit with the saved status.
on_term() {
  exit ${status:-1}
}
trap on_term TERM INT

sleep "${BRUNO_POST_SLEEP_SECONDS:-30}"
exit $status
