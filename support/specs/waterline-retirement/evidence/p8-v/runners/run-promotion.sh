#!/usr/bin/env bash
set -euo pipefail
source .tmp/tx-parity-phase0/env.sh
unset sails_persistence__groups__vocabulary__backend RBPORTAL_VOCABULARY_BACKEND
timeout 600 npm --prefix packages/redbox-core run test:vocabulary-transition > .tmp/wrp8/promotion-transition.log 2>&1
printf 'default live runner complete\n'
timeout 600 npm --prefix packages/redbox-core test -- --exclude test/unit/startup-module-loading.test.ts > .tmp/wrp8/promotion-core.log 2>&1
timeout 90 npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 5000 test/unit/startup-module-loading.test.ts > .tmp/wrp8/promotion-startup.log 2>&1
printf 'default core complete\n'
timeout 900 bash .tmp/wrp8/run-index.sh promotion
printf 'default indexes complete\n'
mkdir -p .tmp/wrp8/held-node-modules
restore() {
 for dep in redoc should; do
  if [[ -d .tmp/wrp8/held-node-modules/$dep ]]; then mv .tmp/wrp8/held-node-modules/$dep node_modules/$dep; fi
 done
}
trap restore EXIT
for dep in redoc should; do mv node_modules/$dep .tmp/wrp8/held-node-modules/$dep; done
timeout 900 bash .tmp/wrp8/run-portal.sh default
printf 'default portal complete\n'
