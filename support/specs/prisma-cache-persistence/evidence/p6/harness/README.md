# P6 institution rehearsal inputs

Archived synthetic rehearsal, not a production migration script. Never substitute
an existing database/Compose project. `run.sh` creates a uniquely named project
and three named volumes (source, restore7, restore8), then removes only that
project's resources in its EXIT trap. Its database name is guarded
`redbox_cache_p6`; ports are ephemeral and loopback-only. No development container
or volume is used. Backups/results remain under ignored `.tmp/prisma-cache-p6`.

Build core and the immutable old application before starting the timed tests:

```bash
mkdir -p .tmp/prisma-cache-p6/legacy-source
git archive 0cfbd62b93260b63ad907d7c01ed9f33a2af619e | tar -x -C .tmp/prisma-cache-p6/legacy-source
npm run check:cache-contract
npm --prefix packages/redbox-core run build
bash support/specs/prisma-cache-persistence/evidence/p6/harness/run.sh
```

`Dockerfile.legacy` reuses the archived build instructions and restores the
**original root lock graph** after standalone core compilation. The coordinator
runs legacy operations in that Docker build stage with `--output type=cacheonly`
and host networking to the uniquely owned loopback MongoDB port. No image is
exported/pushed and no current application dependencies are mounted into the
old process. This avoids copying/exporting a large complete dependency tree;
initial multi-stage/export attempts were interrupted after compilation because
of disk contention. The original source SHA, both lock hashes, exact Node/npm
and driver versions are verified/recorded independently of Docker's ambient
worktree VCS metadata.

`worker.cjs seed` runs inside the old build container with its own original source/deps,
asserts both original lock hashes and absence of the new persistence API, loads
actual Sails/Waterline models and adds a callback-only CacheEntry override. It
creates 11 cache documents including duplicate names, missing data, rich BSON,
and unrelated legacy fields; also existing Waterline users/roles, sessions,
GridFS bytes, a storage record and an Agenda job. Current source/node_modules
are never mounted into that old application. Only this synthetic harness is
copied into that stage, with dependency resolution inside the old application.

The coordinator/other worker modes use the current host Node and compiled core
against the isolated container databases. `old-read` repeats original-application
reads against the restored 7.0 target and upgraded 8.0 source. Source volume
initialization begins without an index script. The upgrade overlay then mounts
`fresh-index.js`; startup on the pre-existing volume skips it, leaving the absent
index/duplicates for the explicit remediation assertions.

Two **synthetic data-owner decisions** are hardcoded and asserted, not generic
cleanup rules: D1 renames only the duplicate owned by B to `duplicate:owner-b`;
D2 converts only `rich`'s Date to the documented versioned ISO-string codec.
Counts/IDs remain, and canonical BSON asserts the other nine rows are unchanged.
Failed index/startup/value reads leave data intact. Unique-index ensure is
explicit and idempotent. Do not use these fixture decisions on institution data.

Both pre-upgrade and post-cutover backups are complete quiesced logical dumps.
They restore to **separate empty servers of the matching engine major**, with
canonical document/index/collection-option hashes compared per namespace.
Readiness checks then run actual cache/branding/migrated-hook/shared clients,
including independent-process persisted reads. No engine downgrade is attempted.
The sample is standalone/unauthenticated amd64 and does not qualify production
auth/TLS/SRV, sharding, replica-set backup, all private hooks or final stable v6.

The synthetic Agenda probe uses a one-second lock lifetime: this installed
Agenda version leaves its half-lock-lifetime monitor delay alive after stop.
No production setting/library is changed. Storage probes use fresh IDs on the
source and restored deployment because removal deliberately retains the native
storage identity ledger; restoration must not erase that ledger to reuse an ID.

If replaying the abandoned image-export approach, remove only newly created P6
tags after recording their identities. Preserve pre-existing images and global
Docker resources. The accepted cache-only path creates no application image tag.
