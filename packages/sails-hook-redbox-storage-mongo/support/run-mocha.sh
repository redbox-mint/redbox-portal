#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

BASE_PATH=/opt/redbox-portal/node_modules/@researchdatabox/sails-hook-redbox-storage-mongo

cd "${BASE_PATH}"
npm install --ignore-scripts

cd /opt/redbox-portal
# This is breaks in CI because we're volume mounting in the hook module and npm will try and change it. This works around the issue by doing the install in a tmp dir before copying everything but the hook back
mkdir -p /tmp/redbox-portal
cp -Rf node_modules /tmp/redbox-portal/
cp package.json /tmp/redbox-portal/
cp package-lock.json /tmp/redbox-portal/
cd /tmp/redbox-portal
npm install --ignore-scripts
rm -Rf /tmp/redbox-portal/node_modules/@researchdatabox/sails-hook-redbox-storage-mongo
cp -Rf /tmp/redbox-portal/* /opt/redbox-portal/
cd /opt/redbox-portal


exec node \
  /opt/redbox-portal/node_modules/.bin/mocha \
  --exit --no-package \
  --config ${BASE_PATH}/test/unit/.mocharc.js \
  ${BASE_PATH}/test/unit/bootstrap.js \
  ${BASE_PATH}/test/unit/**/*.test.js
