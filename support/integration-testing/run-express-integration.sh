#!/usr/bin/env bash
# A mounted candidate uses prebuilt source. Artifact qualification never mounts it.
set -euo pipefail
cd /opt/redbox-portal
# Existing comparison profiles contain arbitrary Sails rc keys. Translate their
# fixture intent explicitly in express-integration.config.cjs, retaining v6 CSRF.
while IFS= read -r task_name; do
  if [[ "$task_name" == sails_* ]]; then unset "$task_name"; fi
done < <(compgen -e)
export REDBOX_APPLICATION_CONFIG=/opt/redbox-portal/support/integration-testing/express-integration.config.cjs
export REDBOX_SESSION_SECRET=integrationtest-only-v6-session-secret-at-least-32
node app.express.cjs --maintenance=indexes:ensure
exec node app.express.cjs
