#!/usr/bin/env bash

set -euo pipefail

cd /opt/redbox-portal

if [[ -d .git && -w .git ]]; then
  npm install --ignore-scripts --strict-peer-deps
else
  echo "Skipping npm install: /opt/redbox-portal is not a writable checkout mount; using image dependencies."
fi
