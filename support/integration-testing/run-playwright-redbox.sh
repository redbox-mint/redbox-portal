#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal

npm install --ignore-scripts --strict-peer-deps

exec node app.integrationtest.js
