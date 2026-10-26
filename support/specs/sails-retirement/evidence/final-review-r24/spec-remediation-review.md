# R24 bounded Spec remediation review

Accept. WSU `8dd6111` resolves the R24 A/P2: the default public URL follows the
published host port, explicit `REDBOX_PORTAL_APP_URL` takes precedence, and empty
selectors retain defaults.

The same independent reviewer executed all four committed regression cases in
memory and four actual offline Compose cases; all passed. The tests retain
invalid-token and foreign-origin rejection checks. No unresolved objection or
files modified.

R24 remains a one-finding round with remediation, not a zero-finding round.

These follow-up results are separate reviewer-reported checks; they are not
added to the main full WSU suite or 12-row baseline/incoming/current comparison.
