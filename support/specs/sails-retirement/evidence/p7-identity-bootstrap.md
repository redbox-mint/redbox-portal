# P7 production prerequisite: owned identity bootstrap

The production-composition audit found default administrator creation and path-rule
seeding still embedded in Sails services. The new `identity/bootstrap.ts` operations
accept explicit repositories/configuration and are exported by the narrow
`redbox-core/identity` entrypoint. The comparison services call the same operations.
This removes an implementation prerequisite; it does not supply the complete
production portal or complete SR-046/048/049/050.

Administrator creation awaits the canonical repository membership write before
startup can complete. The former RxJS chain constructed inverse membership-write
Observables without subscribing to them; the canonical repository already stores
both directions through one relation. The new operation writes that relation
once per selected role. Existing administrator credentials and operator-edited
memberships are retained. A same-name account without the selected administrator
role fails with an explicit reconciliation diagnostic instead of being promoted.
An interrupted bootstrap is nontransactional and may require checkpoint recovery.

Policy bootstrap resolves every configured role before writing any policy and
copies configuration instead of replacing role names with database IDs in the
startup object. Existing stored policies are preserved. The comparison adapter
retains its existing rule-loading and role-resolution methods.

Identity persistence now accepts an application-owned `assignPendingAccess`
callback. Its implementation no longer looks up global `UsersService`; only the
Sails bootstrap binds that comparison dependency. Read-only/maintenance owners
can initialize without the record writer. A production identity writer must bind
the selected user's actual pending-access operation. The callback is retained on
the owner, survives group reuse, cannot be rebound to another input and is not a
process-global cache. A fresh owner receives its own binding.

## Verification and corrections

Node **26.11.1**, npm **11.20.0**; no dependency change. Core TypeScript emission,
focused formatting and lint checks are recorded with the final results below.
No existing test/assertion/timeout was changed.

The first full existing core run with all four Mongo inputs supplied returned
**4479 passing / 7 unchanged pending / 2 failing**. Both failures were the unchanged
`PathRulesService` bootstrap tests: my initial extraction bypassed its established
loader/population and role-resolution methods. The shared input now receives
explicit `readRules`/`roleId` operations, preserving those seams and allowing the
neutral caller to bind the selected repositories and roles. The unchanged focused
suite then passed **12/0/0**, exit 0. Initial full log:
`.tmp/sails-retirement/p7/core-identity-bootstrap/suite.log`; focused log:
`.tmp/sails-retirement/p7/pathrules-bootstrap-focused.log`.

The new real-Mongo aggregate starts with an empty disposable database, creates real
roles and policies, holds completion of a real membership write while checking
that activation is refused, then reopens with a fresh owner. It checks password
hashes/token preservation, both directions of membership without duplicate edges,
operator-edited policy/role retention, immutable seed configuration, validation
before any policy write, refusal to elevate an unrelated account, callback
isolation and zero owned pools/Prisma clients after stop. It uses the compiled
narrow identity export and rejects comparison/Sails imports; it mounts no fake
portal or test-only HTTP route.

During harness development an omitted required synthetic email caused a real
scalar-validation rejection. Follow-up attempts correctly refused the dirty
scratch database left by that aborted run. The harness now observes initialization
failure while waiting for the membership barrier and always closes/drops its owned
resources. Those failed attempts are not counted as qualification. The final check
must run without `--test-force-exit` so leaked resources cannot be hidden.

## Final corrected-source results

Source: `17766ea5bd7ff9761c9447c226000ed9da2f2e90`. Node 26.11.1/npm
11.20.0. TypeScript emission and focused Prettier/oxlint checks passed. No
dependency or existing test changed. The new compiled qualification completed
**1 aggregate passing / 0 failing / 0 skipped**, exit 0, without force-exit
(test 1645.899804 ms; process 2086.633672 ms):

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
node node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
SR_IDENTITY_BOOTSTRAP_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_identity_bootstrap \
  node --test --test-reporter=tap packages/redbox-core/test/qualification/identity-bootstrap.cjs
```

Log: `.tmp/sails-retirement/p7/identity-bootstrap-mongo-final2.log`. The harness
drops its disposable database and closes its native client; the stopped application
reports zero pools and Prisma clients. The Mongo container remains available for
subsequent P7 work.

The first corrected-source full rerun returned **4478 passing / 7 pending / 3
failing**, exit 3. The unchanged standalone-driver-foundation checks require empty
`wr_p1_core`/`wr_p1_storage` databases; these still held the previous run's nine
collections, explicit indexes and cache entry. Only those two owned scratch
databases were reset. An initial reset used the wrong in-container port (27017
instead of this host-network fixture's 29512) and failed with connection refused;
the prematurely launched rerun was terminated before qualification and restarted
after the successful reset. This was a harness error, not a passing run or a code
change. No assertion, timeout or environment-dependent test was altered.

```sh
DOCKER_HOST=unix:///run/sr-p7-engine.sock docker exec sr-p7-p1-bootstrap-regression \
  mongosh 'mongodb://p1_fixture:p1-only@127.0.0.1:29512/admin?authSource=admin' \
  --quiet --eval 'for (const name of ["wr_p1_core", "wr_p1_storage"]) { print(name, JSON.stringify(db.getSiblingDB(name).dropDatabase())); }'
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:29511/redbox_prisma_p7_full \
P1_MONGO_URL='mongodb://p1_fixture:p1-only@127.0.0.1:29512/wr_p1_core?authSource=admin' \
FIGSHARE_TEST_MONGO_URI=mongodb://127.0.0.1:29511/sr_p7_figshare \
SIEM_TEST_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_siem npm run test:core
```

Final unchanged core suite: **4481 passing / 7 unchanged explicitly pending / 0
failing**, exit 0, about three minutes. All four real-Mongo inputs were supplied;
the 61 formerly environment-pending cases actually executed. MongoDB 8.0.34/FCV
8.0 supplies persistence, Figshare and SIEM; MongoDB 9.0.4/FCV 9.0 supplies the
authenticated foundation fixture. The seven explicit pending cases are the same
RAiD (2), trigger-template (2) and workspace HTTP (3) cases recorded in the earlier
P7 evidence. Logs: `core-identity-bootstrap-final/suite.log` (dirty-fixture failure)
and `core-identity-bootstrap-final/suite-fresh-p1.log` (successful fresh run), under
`.tmp/sails-retirement/p7/`.

These are core/domain and compiled-bootstrap results. They do not claim the
existing Bruno/Playwright/root Mocha suites ran on a complete Express portal,
and the source-58 clean artifacts have not qualified this later source commit.
