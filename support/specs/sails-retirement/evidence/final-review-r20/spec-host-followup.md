**Verified A/P2 — extension loading parity**, grouped as one finding with two mechanisms at portal `00de66500`:

- **Condition mismatch:** dev-tools recognizes `module-sync`/`node-addons`; the host’s `import-meta-resolve@4.2.0` recognizes only `node`/`import`. Condition-only exports pass preflight but fail actual `loadExtensionModule` with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Other branch combinations incorrectly reject loadable hooks.
- **Nested fallthrough:** the ponyfill returns `null` for an unmatched condition object. For `{node:{require:"./entry.cjs"},default:"./entry.js"}`, the checker accepts while the actual host rejects. I independently reproduced this and the equivalent nested unknown-condition case.

Required spec: [hook-migration-v6.md:39](/home/andrew/src/github/redbox-portal/support/specs/sails-retirement/hook-migration-v6.md:39): “an unmatched nested condition continues to later alternatives.”

My **15-case Node 26.11.1 actual-loader probe** verified **8 condition discrepancies, 2 nested-fallthrough discrepancies, and 5 agreeing controls**. Manifests were supplied through an in-memory read shim; selected targets were existing files, and successful controls loaded through the real core loader.

Changing only dev-tools’ conditions is insufficient to satisfy documented nested fallthrough. A core loader/dependency correction needs corresponding host-level regression coverage; native Node comparisons alone missed this.

The independently verified **latest-PDF GET/CSRF A/P2 remains separate**. No files changed; remediation remains with the main reviewer.
