#!/usr/bin/env bash
set -euo pipefail
source .tmp/tx-parity-phase0/env.sh
unset sails_persistence__groups__branding__backend RBPORTAL_BRANDING_BACKEND
compose=(docker compose -p wrp9-815a2a6e -f .tmp/wrp9/mongo.yml)
timeout 600 npm --prefix packages/redbox-core run build > .tmp/wrp9/promotion-build.log 2>&1
timeout 900 npm --prefix packages/redbox-core run test:branding-transition > .tmp/wrp9/promotion-transition.log 2>&1
timeout 600 npm --prefix packages/redbox-core test -- --exclude test/unit/startup-module-loading.test.ts > .tmp/wrp9/promotion-core.log 2>&1
timeout 90 npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 5000 test/unit/startup-module-loading.test.ts > .tmp/wrp9/promotion-startup.log 2>&1
timeout 300 npm --prefix packages/redbox-core run typecheck:persistence > .tmp/wrp9/promotion-types.log 2>&1
timeout 300 node_modules/.bin/tsc --noEmit > .tmp/wrp9/promotion-root-types.log 2>&1
timeout 90 npm run lint > .tmp/wrp9/promotion-lint.log 2>&1
timeout 180 "${compose[@]}" up -d --wait > .tmp/wrp9/promotion-main-up.log 2>&1
timeout 900 bash .tmp/wrp9/run-index.sh promotion
timeout 60 "${compose[@]}" stop > .tmp/wrp9/promotion-main-stop.log 2>&1
mkdir -p .tmp/wrp9/held-node-modules
restore() {
 for dep in redoc should; do
  if [[ -d .tmp/wrp9/held-node-modules/$dep ]]; then mv .tmp/wrp9/held-node-modules/$dep node_modules/$dep; fi
 done
}
trap restore EXIT
for dep in redoc should; do mv node_modules/$dep .tmp/wrp9/held-node-modules/$dep; done
timeout 900 bash .tmp/wrp9/run-portal.sh default
