#!/usr/bin/env bash

set -euo pipefail
set -o xtrace

# This script does the preparation on the guest needed to run local development and tests.
# The first argument to the script is the base dir.

BASE_DIR="${1}"

# Copy the test resources to the correct places.
echo "Copying test resources..."
cp --recursive --verbose "${BASE_DIR}/test/resources/." "${BASE_DIR}/"
cat "${BASE_DIR}/config/emailnotification.js"