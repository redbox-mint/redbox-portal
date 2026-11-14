#!/usr/bin/env bash
set -euo pipefail

# Reject an invalid selector before bundle/index preparation or host loading.
node /opt/redbox-portal/support/integration-testing/playwright-host.cjs

# Keep the browser-facing URL explicit for both migration hosts. The v6
# configuration reader rejects the historical portal-specific environment key;
# consume it at the acceptance boundary and forward its supported equivalent.
: "${REDBOX_PORTAL_APP_URL:?Set the published Tailscale portal URL}"
[[ "$REDBOX_PUBLIC_URL" == "$REDBOX_PORTAL_APP_URL" ]]
exec env -u REDBOX_PORTAL_APP_URL bash /opt/redbox-portal/support/integration-testing/run-playwright-redbox.sh
