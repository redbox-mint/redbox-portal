#!/usr/bin/env bash
# A mounted candidate uses prebuilt source. Artifact qualification never mounts it.
set -euo pipefail
[[ "${RBPORTAL_PLAYWRIGHT_HOST:-}" == express ]] || { echo "Legacy runner requires RBPORTAL_PLAYWRIGHT_HOST=express" >&2; exit 1; }
cd /opt/redbox-portal
export REDBOX_APPLICATION_CONFIG=/opt/redbox-portal/support/integration-testing/express-integration.config.cjs
export REDBOX_SESSION_SECRET=integrationtest-only-v6-session-secret-at-least-32
node app.express.cjs --maintenance=indexes:ensure
exec node app.express.cjs
