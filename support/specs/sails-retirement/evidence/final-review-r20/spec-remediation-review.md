R20 remediation follow-up against incoming portal `00de66500` and WSU `c1c847d`. **No remaining verified A/P1/P2 findings in the reviewed resolver/loading remediation; no additional B finding.** This records the existing R20 assessment and evidence-retention rerun, not a new independent review round.

The shared resolver now selects the host's native-import target for both core and preflight, including Node 26 default conditions, nested fallthrough, ordered/null masking, arrays and pattern precedence. No wrong-target selection was verified. Reviewed source SHA256: `exports.ts` = `fa65dbf932ec7040a5115353c5ae867848d6b4300de7dc2d0603b3be99d88c4e`; `loading.ts` = `8b499b840ab05640739755a75eb728711aa93cbc58db7eb5117908acbb833ed8`.

The previous loading-parity A/P2 is resolved in this code. WSU's GET-CSRF removal and regression test were reviewed; this reviewer did not freshly execute that suite.

Raw evidence is retained under `.tmp/sails-retirement/final-review-r20/spec-followup/`:

- `shapes-25000.cjs`, `shapes-25000-rows.jsonl`, `shapes-25000-summary.json`: **25,000 deterministic shapes, zero selection discrepancies**; fixed seed `0x20c0ffee`.
- `namespace-identity.cjs`, `namespace-identity-rows.jsonl`, `namespace-identity-summary.json`: **40 strict namespace-identity comparisons plus four rejection controls, zero discrepancies**. Each format contributes 20 successful comparisons and two controls. Both candidate branches load successfully and have distinct namespaces.
- `run-summary.json`, separate stdout/stderr logs, `inputs/`, `SHA256SUMS` and `ledger.json` retain exit statuses, executable/source provenance and raw result paths. README distinguishes this freshly retained reproduction from earlier inline probes and documents an initial harness-only canonicalization correction.

Command from portal root:

```sh
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node .tmp/sails-retirement/final-review-r20/spec-followup/run-all.cjs
```

Node **26.11.1** uses default `node/import/module-sync/node-addons` conditions. Shape comparisons use Node's export selector and final URI checks without filesystem existence claims. Identity probes call the actual built host with in-memory manifests and existing CJS/ESM targets.

Parent-reported separate matrix: **1,271 cases, zero final total discrepancies; incoming 200 preflight + 70 host = 270**. This reviewer did not rerun that fixture-writing matrix.

Four-task disposition: no remaining resolver/loading objection to **SR-055**; this focused follow-up does not independently requalify **SR-005/045/049** or refresh historical installed-runtime evidence. No product edits, WSU writes, agents or Docker resources were made for retention.
