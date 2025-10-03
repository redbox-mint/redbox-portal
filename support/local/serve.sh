#!/usr/bin/env bash

set -euo pipefail

function msg() {
  echo ""
  echo "${1}: ${2}"
  echo "-----------------------------------------"
}

case "${1}" in
        "start")
                msg "info" "Creating local development data directories"
                sudo mkdir -p ./support/local/.serve-data
                sudo mkdir -p ./support/local/.serve-data/solr
                sudo chown 8983:8983 ./support/local/.serve-data/solr

                msg "info" "Starting local development server"
                docker compose \
                  -f ./support/local/compose.yml \
                  -f ./support/local/compose.serve.yml \
                  up --build --menu=false --abort-on-container-exit --exit-code-from redbox
                ;;
        "reset")
                msg "info"  "Removing local development server"
                docker compose \
                  -f ./support/local/compose.yml \
                  -f ./support/local/compose.serve.yml \
                  down --volumes
                msg "info"  "Removing local development data directories"
                sudo rm -rf ./support/local/.serve-data
                ;;
        *)
                msg "warn" "Unknown operation '${1}'"
                exit 1
                ;;
esac
