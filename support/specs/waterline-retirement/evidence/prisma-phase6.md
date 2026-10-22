# Prisma phase 6 — identity U

2026-10-22; worktree `t3-815a2a6e`, branch `t3/waterline-retirement`, base
`643c9f96c`. ARM64 / 2 CPUs / 12 GiB; Node **24.16.0**, npm **11.20.0**.
Exact Prisma **8.0.0-rc.24** / orm-mongo **8.0.0-rc.19** pins and locks unchanged.
Commands are externally timed; heavy commands run sequentially. Only `wrpz6`
Docker resources; MongoDB exclusively
`mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
No transactions, prior-image/budget/mixed-instance/browser campaigns, push or PR.

## Inventory and implementation

Inventory used the six Waterline definitions/callbacks; UsersService,
RolesService, PathRulesService, WorkspaceService, RDMPService; Passport
local/AAF/OIDC/bearer strategies and policies; admin/user-management controllers;
default role/bootstrap writers, migrations and hook model registration; P0
inventory/validation and physical `evidence/references.json`. No first-party
User model override adds stored attributes; private institution overrides remain
unknown and must pass the mapping/callback preflight or select Waterline.

**62 fields** including identities and audits, all in logical **mongodb**:

| Model / physical collection | Fields |
| --- | --- |
| User / user | **21**: _id, username, password, lastLogin, type, name, email, token, additionalAttributes, linkedPrimaryUserId, accountLinkState, loginDisabled, displayname, cn, edupersonscopedaffiliation, edupersontargetedid, edupersonprincipalname, givenname, surname, createdAt, updatedAt |
| Role / role | **5**: _id, name, branding, createdAt, updatedAt |
| UserLink / userlink | **11**: _id, primaryUserId, primaryUsername, secondaryUserId, secondaryUsername, brandId, status, createdBy, notes, createdAt, updatedAt |
| UserAudit / useraudit | **6**: _id, user, action, additionalContext, createdAt, updatedAt |
| PathRule / pathrule | **10**: _id, path, role, branding, can_read, can_write, custom, can_update, createdAt, updatedAt |
| WorkspaceApp / workspaceapp | **6**: _id, app, user, info, createdAt, updatedAt |
| RoleMembership / role_users__user_roles | **3**: _id, user_roles, role_users |

The seven additional auth-claim strings are real writers, as is PathRule's
`can_update`; `can_write` does not replace the evaluator's existing grant.
Fixture-only probe fields are excluded. User/Role `roles`/`users` and
`workspaceApps` are inverse relationships, not stored arrays. Loaded definitions
rediscover **one** junction: `role_users__user_roles`, with all three keys BSON
ObjectIds, no audits, pair uniqueness or cascade. Duplicate/dangling edges remain.
Role/PathRule branding, PathRule role and WorkspaceApp user stay ObjectIds;
UserLink application identifiers and all ordinary timestamps stay strings.

U never had a driver adapter. Its new plain repositories use Prisma model CRUD
and an actual loaded-model Waterline rollback. Password creation uses bcryptjs
cost 10; generic patches do not rehash, and UsersService still hashes submitted
password updates with cost 10. Private password verification/API-hash lookup
return safe accounts. DTOs, stored audit projections and controlled errors omit
credential fields, including nested JSON/header contexts; authorized issuance
endpoints still return the newly issued key. Admin uses `hasApiKey` to retain
its suppressed-key display. Undefined audit members are omitted as in Waterline
JSON serialization.

Migrated callers: UsersService (all auth/account/link/audit/profile flows),
RolesService/default roles, PathRulesService, WorkspaceService, RDMPService's
permission-user lookup, AdminController and webservice/UserManagementController.
Branding's Prisma and Waterline Role projections now call U, and reference
named-query user/role/pathrule targets use U. Policies and UserController
already call these services; authorization checks retain their order.
A source audit finds no active direct U model CRUD outside rollback. Two old
commented User.findOne examples in RecordsService are inert.

Account linking preserves link creation, primary-role merge, alias-role
replacement, alias-key/state update, record rewrite, then audit. It still selects
records through the current record owner and calls RecordsService mutation /
pending-access operations; record authorization is **not migrated here**.
Post-write callbacks and multi-step failures keep earlier effects, without
retry, compensation or transaction. `updateUserRoles` now reads back its safe
account after replacement, fixing legacy callback-only completion/error output.

`persistence.groups.identity.backend` accepts **prisma | waterline**, defaults
to **prisma**, and rejects `mongodb` with guidance. Lazy initialization/drain uses
the shared core Prisma runtime; U initializes before branding. Readiness inspects
seven built-in `_id` scopes with Prisma controls and performs **no U DDL**.
Existing login/email/ownership indexes and collation stay unchanged, including
operator unique indexes. Supplied Compose stacks/templates, Mocha selector
forwarding and wiki operator guidance include `RBPORTAL_IDENTITY_BACKEND`.
Waterline definitions remain for explicit rollback/preflight until phase 8.

Registers: **U-01–U-11** preserve hashing/callback timing, duplicate/dangling
membership, link partial effects, uniqueness/collation, auth/grant order and
workspace read/create ordering; accept optional-null/unknown-field model reads;
improve credential/error safety, conditional predicate fencing and membership
completion/readback. **U-11 is preserved:** the revoke endpoint acknowledges a
null/empty-key request but leaves the stored key active. Loaded Waterline rejects
its null-string patch; the old callback wrapper swallowed that error. Prisma
retains the same no-write/acknowledgment outcome explicitly. Both backends reject
the null patch and keep the stored hash in the credential transition case.
Fixing actual revocation requires explicit authorization to change non-racing
auth outcomes. Account linking still clears an alias key using an accepted empty
string. **U-PG-01** registers catalog/index controls. There is no
new raw/native operational U CRUD or direct-driver exception.

## Verification

Commands source `.tmp/wrpz6/env.sh`; logs/runners are ignored under `.tmp/wrpz6`.

| Command | Result |
| --- | --- |
| `timeout 360s npm --prefix packages/redbox-core run test:identity-transition` | **21 passed / 0 failed**, `transition-last.log`: six bidirectional model pairs, loaded junction/mapping guard, two membership directions, optional/unknown-field preservation, existing unique-index/collation retention, real UsersService link partial failure on both backends, safe credentials/audit/errors and bcrypt/callback timing. |
| `timeout 720s bash .tmp/wrpz6/run-core.sh` plus focused remediation below | Full run: **4,246 passed / 108 pending / 39 failed** (`core.log`). All failures closed with focused reruns; **4,308 applicable cases pass including isolated startup**, 108 pending, no unresolved failure. The full suite was not repeated. |
| Focused core commands: same Mocha preload/timeout options, affected six files; RequestChronicleServices; UsersService/SecurityEventCapturePrivacy; UsersService `--grep getUserAudit`; isolated startup | **168 + 44 + 108 + 3 + 1 passing** in overlapping selections, `core-focused-final.log`, `core-chronicle-final.log`, `core-verified.log`, `core-audit-verified.log`, `core-startup.log`. Token/optional-claim focused selection adds **3 passing** in `core-token-verified.log`. The selections initially retained ten callback-fixture failures and one stale audit-redaction expectation, fixed by the subsequent focused selections. The before-hook fix also exposes 23 previously unexecuted routing tests. |
| `timeout 2600s bash .tmp/wrpz6/run-standard.sh`, then `run-standard-remaining.sh` | Standard portal Mocha: **417 passed / 10 pending / 2 failed** initially; **2/2** focused cases pass after fixes (`mocha.log`, `mocha-focused.log`): **419 passed / 10 pending**, no unresolved failure. No successful portal cases repeated. |
| `timeout 1500s bash .tmp/wrpz6/run-api.sh` | Bruno General **folders 1–4 only: 309/309 requests, 553/553 tests, 3/3 assertions**, no failures/skips; `bruno.log`, safe `bruno-tests/result.json`. Existing OIDC folders 5–6 run **once: 13/13 requests, 17/17 tests**, no failures/skips; `bruno-oidc.log`, safe `result-oidc.json`. |
| `timeout 180s npm --prefix packages/redbox-core run build`; `timeout 150s node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json` | PASS, `build-last.log`, `compile-revoke.log`: generation, compilation and contract copy; final compilation after the lint correction and U-11 compatibility path. |
| `timeout 180s npm --prefix packages/redbox-core run typecheck:persistence`; `timeout 90s npm --prefix packages/redbox-core run lint`; `timeout 90s npm --prefix packages/redbox-core run check:prisma` | PASS, `typecheck-last.log`, `lint-last.log`, `freshness-final.log`. No lint diagnostics remain; pins/lockfiles unchanged. `git diff --check` passes. |

The full core failures were existing domain/privacy fixtures still reaching model
fakes after U moved; explicit repository fakes and callback-shaped fixture updates
restore coverage. Audit expectations now assert omitted credential keys rather
than redacted placeholders, matching the stronger DTO contract. Portal failures
exposed undefined audit members and a membership fixture that submitted an
undefined ID while old callback binding swallowed its error. Both adapters keep
invalid-ID rejection before deletion; the fixture now submits real IDs and
asserts the actual replacement. API verification additionally found and fixed
the controller's nested callback-tuple expectation. Bruno initially stopped on
a missing temporary font asset (52 passed, 1 request error, 256 skipped), then
the update callback mismatch (153 passed, 1 request error, 155 skipped), then
the null-revocation quirk (155 passed, 1 failed request / 2 failed tests, 153
skipped). Assets/implementation/parity were corrected before the complete
General run; no unrelated test scope was added. U-06/U-10/U-11 record these
projection/completion decisions; writes and authorization checks keep their order.

Installed CLI inspection reports **79 ready scopes / 36 collections**, including
all **seven U scopes using Prisma** (`index-cli.json`). The stock mount-based
portal/API stacks use pinned Node/MongoDB images and isolated `wrpz6-mocha` /
`wrpz6-bruno` projects with local resource limits. No application image is built.
Detailed API response reports are reduced to safe summaries after count extraction.

## Phase 7 handoff

Records/DeletedRecord, CAS/revision/incarnation/lifecycle and source-intent
fencing, permanent **recordidentity**, record authorization, **Counter with
Prisma atomic increment**, and attachment **OID rebind** remain with their
current Waterline/native owners. Extend the existing maintenance-only
record/deletedrecord Prisma roots; do not migrate bytes or assume those
projections already own record CRUD. Keep current datastore routing, schema
BSON-Date codecs, U's storage operation ordering and unknown outcomes. GridFS
permanently stays on the driver under ADR 0004. Phase 8 removes definitions,
selectors, shims and remaining Waterline dependencies.

Local commits: `e8f5501dd` (contract), `c320a1804` (repositories/callers),
`85b6fa572` (light tests), `81c9cecaa` (plain API results/optional claims),
`b4ce25ac9` (Compose selectors), `658a3512e` (explicit legacy revoke parity).
The following documentation commit records evidence, both registers and status.
No push or PR.

Cleanup audit: **zero owned containers (including stopped), networks, volumes
or images**, by `wrpz6` names/task label and both Compose-project labels.
Unrelated `development-*` containers remain running. No application image was
built. Temporary root dependencies are restored and their holding directory is
empty. `.tmp/wrp8/prior-0ea5e9bc2.tar` remains **723,557,888 bytes**, SHA256
`321e678c626f7883306209e1cbdc257afaf08185b38ce7ee99f5218692a44091`.
