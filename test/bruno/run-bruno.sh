#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/bruno-tests

npm install --ignore-scripts --strict-peer-deps

ls -la node_modules/.bin/

exec node_modules/.bin/bru run --env int-test --format junit --bail \
 --output /opt/junit/backend-bruno/backend-bruno-general.xml
