#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/bruno-tests

npm install --ignore-scripts --strict-peer-deps

find . \
  -type d \( -name node_modules -o -name environments \) -prune -o \
  -type f -name '*.bru' \
  -exec node validate-bruno-files.js '{}' \;

on_term() {
  exit ${status:-1}
}
trap on_term TERM INT

rm /opt/junit/backend-bruno/backend-bruno-s3.xml || true

set +e
node_modules/.bin/bru run "7 - S3 Attachment Storage" \
  --disable-cookies --env int-test --format junit --bail \
  --output /opt/junit/backend-bruno/backend-bruno-s3.xml
status=$?
set -e

wget -qO- --timeout=5 --tries=1 http://redboxportal:1599 || true

if wget -qO- --timeout=5 --tries=1 http://redboxportal:1500/default/rdmp/home >/dev/null 2>&1; then
  echo "redboxportal is still responding"
fi

sleep "${BRUNO_POST_SLEEP_SECONDS:-30}"
exit $status
