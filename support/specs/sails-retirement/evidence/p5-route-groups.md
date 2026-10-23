# SR-031 — Repeatable route-group acceptance and policy generalization

Starting source `dcf931ea2` on `stack/sails-retirement`, shared checkout. This
record reuses P0–P4; no dependency versions or lockfiles changed. Commands run at
the repository root with this qualified PATH:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
```

Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, ts-node **10.9.2**,
Mocha **11.7.6**, Express **5.2.1**, Passport **0.7.0**, express-session
**1.19.0**, connect-mongo **6.0.0**, Mongo driver **7.7.0**, existing Prisma
ORM **8.0.0-rc.19** / CLI **8.0.0-rc.24**, Bruno CLI **3.5.2**.

## Inventory and acceptance

`../route-group-acceptance.md` is the per-slice checklist: exact methods/contracts,
domain collaborators, selected factories/overrides, lifecycle/drain, policies,
validation, public parity, import closure and focused actual execution. The offline
`route-inventory.cjs` reads built declarations without loading Sails, opening a
database or binding a listener. `--check` compares exact current entries with the
committed inventory and fails on drift. The JSON source SHA is the implementation
base, not a claim of completed standalone route coverage.

**332 declarations accounted for**: SR-029 **2**, SR-032 **64**, SR-033 **25**,
SR-034 **21**, SR-035 **23**, SR-036 **124**, SR-038 **9**, SR-039 **1**,
SR-040 **46**, SR-041 **9**, SR-042 **2**, SR-043 **6**. Only the two pilot
contracts are marked standalone. This includes legacy AJAX routes and the bundled
development root redirect. PDF declares no HTTP route yet; institution routes
remain SR-005. `ALL` means a legacy any-method declaration, not verified read
safety. CSRF/upload/socket dependencies and static-before-parameter ordering are
explicit in the checklist and manifest; read-only POST previews also require CSRF.

## Resolution of P4 checkAuth review notes

The generalized `createHttpPolicies` retains the old pilot alias. `checkAuth` now
matches legacy behavior: **no path rule proceeds**; anonymous requests use an
injected current default role; matching denied paths return authenticated empty
403, anonymous JSON `{ message: 'Access Denied' }`, or HTML login redirect.
`checkRecordSchemaAuth` returns raw 403 Problem Details with existing private cache
and Vary headers. Real HTTP tests cover both unruled and matching paths, default
Guest access and every denial variant. JSON/authenticated/schema denials await the
bound SecurityEventService `authorization.failure` operation with source
`AuthorizationPolicy`; ordinary HTML login redirects emit no authorization event.
The binding is required, never discovered globally. Fixture compositions disable
SIEM explicitly with a no-op binding; the event-contract test records all calls.
SIEM persistence/delivery itself is outside this slice's claims.

`authorization/PathRules.ts` extracts the **existing** normalized matcher/cache;
the legacy service delegates to that implementation, so there is no duplicated
rule evaluator. Each composition owns a snapshot, explicitly initialized before
serving. Concurrent refresh joins, successful refresh replaces atomically, and a
failed refresh retains the old snapshot. Bootstrap/explicit `loadRules()` remain
the refresh points. Requests never query `identity.list('pathrule', ...)`.
Existing grant-change fixtures now explicitly refresh; actor memberships/disabled
state still reread on every authentication. Uninitialized cache use throws.

The pilot's existing authentication and cross-brand security decisions remain
separate named policies (`isWebServiceAuthenticated`, `brandActor`), with their
affected clients, rationale and migration recorded in design §1.3. They no longer
change generic `checkAuth` semantics. Tests retain wrong-brand/wrong-role denial
before domain work, even when another brand has no rules.

## Actual commands and results

Disposable Docker server **sr-p5-mongo8**, **MongoDB 8.0.34 / FCV 8.0**, standalone,
unauthenticated, **127.0.0.1:34903**. Image
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Fixtures check unique `sr_p4_http_<pid>_<counter>` database names and drop only
those databases after stopping their host/application. This is not institution or
replica-set qualification.

```sh
docker run -d --name sr-p5-mongo8 --memory=768m -p 127.0.0.1:34903:27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker exec sr-p5-mongo8 mongosh --quiet --eval 'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion}))'
npm --prefix packages/redbox-core run build
./node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/http/Policies.test.ts test/services/PathRulesService.test.ts test/policies/pathRuleRouting.test.ts test/policies/checkAuth.test.ts
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-pilot:mongo
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-bruno:mongo
node support/specs/sails-retirement/evidence/route-inventory.cjs
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
npm run lint
git diff --check
```

Clean build (actual Prisma generation/copy), incremental production compilation
and expanded strict source/test typecheck **exit 0**. Policy/cache/legacy regression
**50 passing / 0 failing/pending**. Real Mongo/HTTP pilot **24 passing / 0 failing/
pending**, including 13 released-v5 observations and the compiled import-guarded
host with zero retained pools/Prisma clients. Bruno runner **1 passing / 0 failing/
pending**, executing **2 requests / 4 tests / 0 failures/skips**, on the same actual
standalone HTTP host and real repositories. Repository lint **897 files / 0 errors/
warnings**, exit 0. Inventory generation/check and diff check exit 0.

The existing REST requests labelled record types erroneously called forms (P0's
known fixture defect). Corrected their URLs and the selected definition name;
their assertions remain and the list assertion's label now describes record types.
The archived released-v5 requests/evidence remain unchanged. The repeatable Bruno
runner uses those existing collection files, not another generated parity suite.
It requires Mongo input, starts/stops the owned partial fixture, and fails if Bruno
is missing or returns an error. No synthetic credential is committed in results.

Intermediate failures: first typecheck found a repository-input index-signature
cast left in the extracted legacy seed; changed to its actual plain values. The
next strict check found a union of empty/header object shapes; the test uses real
`Headers` values. An early Mongo run overlapped clean `dist` removal and had
**23 passing / 1 compiled-child failure**; sequential post-build rerun passed all
24. Initial Bruno HTTP requests/tests passed, but the runner's redundant console
format assertion failed on CLI table output; removed that assertion and retained
Bruno's process-exit/test authority. The corrected complete command passed.
No assertion about portal behavior, timeout or skip condition was weakened.

Full Mongo-backed core regression is recorded at round closeout. Broader groups,
browser providers and CSRF have no acceptance claim in this SR-031 record.
