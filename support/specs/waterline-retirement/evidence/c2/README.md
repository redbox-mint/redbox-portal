# C2 cache qualification and retirement evidence

## Compact evidence retention

Raw transcripts, inspect output and source patches are deliberately excluded from
Git. Each directory's `raw-artifacts.json` retains logical filenames, original
byte/line counts, SHA-256 hashes, test counts and bounded excerpts, including
failed/diagnostic attempts. Ledger `log` fields and artifact filename lists are
logical identities resolved through that manifest; they are not missing files.
Commands, exits, durations, runtime/image identities and lock deltas remain in
the structured ledgers. `operations-summary.json` retains workload metadata,
per-sample distributions, resource observations and backend aggregates; the gate
assessment retains its original ratios and checks. Hashes identify the original
unabridged bytes; summaries do not claim to reconstruct them.

New runner output goes to `.tmp/cache-c2-raw/` outside tracked evidence. Use
`python3 packages/redbox-core/test/fixtures/cache-persistence/c2_evidence.py audit support/specs/waterline-retirement/evidence/c2`
to validate ledger-to-manifest hashes, or `compact RAW_DIRECTORY --destination EVIDENCE_DIRECTORY --keep-raw`
to retain summaries from a replay. The removal source patch is reproducible with
`git diff PROMOTION REMOVAL -- . ':!support/specs/waterline-retirement/evidence' ':!support/specs/waterline-retirement/c2-validation.md'`;
its original hash remains provenance for the original accepted tree.


Starting source: `b83234da9a6e5ce31387c75f3873bd3100e83175`, branch
`t3/waterline-retirement`, 2026-10-20. Qualification keeps Prisma as default;
G-C2 passed at `ac39fa987`; separate promotion is `744517a55`. The following
removal change archives Prisma-only runners at `ac39fa987` and retains all raw
qualification/promotion results. Current removal results are under `remove/`.
The gate authority is [C2 validation](../../c2-validation.md).

All live runners allocate their own containers, volumes, ports and/or Compose
projects and clean up those resources. No development MongoDB data is used.
All servers stay standalone MongoDB 8.0.34 / FCV 8.0, pinned to
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Host Node 24.18.0 and npm 12.0.2 run existing commands only. Package lock
maintenance and clean consumers use asserted npm 11.20.0; production packages
run on Node 24.16.0 and 26.11.1. Official driver 7.7.0 remains pinned.

`qualify/results.json` records exact commands, exits, durations and log hashes.
Failed attempts are retained separately and never counted as acceptance.
Current replayable fixtures are under
`packages/redbox-core/test/fixtures/cache-persistence/`:

- `verify-c2.py <stage>` runs checks sequentially. `C2_CHECKS` and
  `C2_SKIP_CHECKS` select labels; successful labels in the same stage are reused.
  Use a fresh stage after changing the implementation. It never rebuilds shared
  `dist` concurrently with a live repository runner.
- `run-c2-tls-srv.sh` exercises actual authenticated TLS and local SRV discovery,
  including rejected CA/credentials. DNS and hosts overrides exist only inside
  its isolated Node container; no host DNS configuration is changed.
- `run-c2-lifecycle.sh` checks inspect-only readiness, explicit synthetic data-owner
  remediation, accepted cache-write draining, shutdown refusal, application
  restart and an actual standalone server restart on the same owned volume.
- `run-c2-standard.sh <stage>` calls the unmodified standard npm Mocha and Bruno
  general runners on new projects, followed by the standard dev entrypoint with
  isolated volumes/ports. A Docker CLI wrapper adds a Compose overlay changing
  mail/attachment/upload targets to fresh project volumes, with writable synthetic
  attachment/upload roots and the fixture's fixed mail hostname as a network-local
  alias; repository commands, services, healthchecks and test selection are unchanged. It restores
  runner-mutated Bruno files and removes its volumes and temporary wrapper.
- `run-c2-browser.sh <stage>` runs the repository's A17 Chromium test against a
  fresh full portal with CSRF, using the documented Playwright workflow. Its
  observer asserts the actual cache adapter and records startup/memory.
- `run-c2-recovery.sh` uses a completed driver checkpoint, independent matching
  engine/data/index/options/assets restoration, explicit current-next Waterline
  configuration rollback and a default-driver forward read after observed write
  completion. Qualification's original Prisma-default core/full-portal image
  probes are frozen at `ac39fa987`; their immutable image/checkpoint evidence
  below remains authoritative.
- Archived at `ac39fa987`: `run-c2-operations.sh` reuses the pilot's fixed workload in nine alternating
  samples (three per backend). Run after all builds and other stacks finish;
  loaded-host samples cannot be operational acceptance. `assess-c2-operations.py`
  applies the inherited provisional next budgets. `c2-observer-control.cjs` is an
  independent read-only control: concurrent default observer requests grow its
  own operation pool (3 to 4 server connections); maxPoolSize=1 holds it at 3.
  Only that observer pool is bounded; application settings/limits are unchanged.

The complete original pre-C2 Dockerfile test image is also built and exercised through its own app.js/HTTP entrypoint. `prior-portal-artifact.json`, the original build/inspect logs and `prior-portal.txt` identify immutable `sha256:cd54d56b5adf3afa9fc7c3ba610601375907bb1a368fc7201a5233c675b75f7c`. Original locks are asserted, retained font/session checkpoints are read, original driver rows are updated/deleted and old CacheService completion is observed by a fresh driver process. The earlier group artifact below supplies additional original-core notification/recovery evidence.

The designated previous group image contains core compiled independently from
`git archive b83234da9`, over the matching pruned dependency layer used by the
programme's earlier group rollback images. Both original lock hashes match;
current compiled outputs and dependencies are not mounted. `Dockerfile.prior`,
the build logs and `rollback-artifact.json` record the assembly and immutable
identity. This is a group-scoped development rollback artifact, not a published
institution or full-portal release image.

Production HA/failover, private hooks/data, capacity and external effect recovery
remain institution/release obligations. A standalone restart is outage recovery,
not an HA or transaction claim. OPS-TX-01 remains undecided and G-TX stays closed.
