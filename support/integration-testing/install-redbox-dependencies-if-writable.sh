#!/usr/bin/env bash

set -euo pipefail

cd /opt/redbox-portal

if [[ -w package-lock.json ]]; then
  npm install --ignore-scripts --strict-peer-deps
else
  echo "Skipping npm install: /opt/redbox-portal/package-lock.json is read-only; using image dependencies."
fi
