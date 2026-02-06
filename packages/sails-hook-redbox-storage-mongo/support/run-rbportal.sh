#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

cd /opt/redbox-portal
exec node app.js
