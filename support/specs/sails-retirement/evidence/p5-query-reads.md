# SR-033 — reporting, search, lineage and audit reads

Verified 2026-10-24 in the shared `stack/sails-retirement` checkout. Domain extraction:
`5a35b6758`; adapter/test commit is the commit introducing this evidence. Parent:
`b861950a5`. No dependency changes or push.

## Implementation and boundaries

All 25 inventoried declarations mount through `http/express/queryReads.ts`.
Named-query collections are registered before `:name`; report previews require
CSRF for browser/session requests and independently verified bearer credentials
for the REST exemption. Policies precede request validation and domain access.
The small collaborator inputs accept institution overrides without importing Sails.

Existing implementations moved once to `src/queries/`: named queries, reports,
Solr reads, harvest history, SIEM reads, integration traces/outcomes, record-audit
mapping, resolved permissions and Figshare status. Comparison services/controllers
delegate to these operations. Core chronicle/conversion helpers also share one
implementation. Report template caches close with the owner. Record audit fallback
writes remain awaited. No workers, indexing, mutations, or provider producers are
started by these route mounts.

Record and integration audit reads authorize the object brand before accessing
its history. Admin-only diagnostics independently check the brand's Admin role.
The security changes and affected clients are in design §1.3. In particular Solr
brand/type/workflow constraints are independent `fq` values; a real Solr `OR *:*`
search returns only the permitted record. Existing `checkAuth` parity and cached
PathRules from SR-031 remain unchanged.

The fixture uses the existing Mongo storage extension's guarded Prisma protocol,
reference/identity/storage/harvest/SIEM repositories and actual HTTP host. It does
not replace storage with a fixture collection. A decorated report collaborator
exercises delayed reads/backend failures. A compiled-process import guard loads
the new query graph and Mongo storage extension without source, Sails, controllers,
compatibility modules or the root barrel.

## Executed commands and results

Commands use the qualified Node toolchain described in `p6-auth-csrf.md`:
Node 26.11.1/npm 11.20.0, TypeScript 5.9.3, Mocha 11.7.6, ts-node 10.9.2,
Bruno 3.5.2, Express 5.2.1, Mongo driver 7.7.0, Prisma ORM 8.0.0-rc.19
(CLI 8.0.0-rc.24). Mongo is the owned `sr-p5-mongo8`, image `mongo:8.0.34`,
localhost:34903. Required URLs never skip tests; databases are unique and dropped.
Search uses owned `sr-p5-solr`, `solr:10.0.0`
(digest `sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`), created with
`docker run -d --name sr-p5-solr -p 127.0.0.1::8983 solr:10.0.0 solr-precreate redbox`.

- `npm --prefix packages/redbox-core run build` — passed, including generated
  Prisma contracts and copied JSON runtime artifacts.
- `npm --prefix packages/sails-hook-redbox-storage-mongo run build` — passed.
- `npm --prefix packages/redbox-core run typecheck:application` — passed.
- `npm --prefix packages/redbox-core run lint` — passed, one prefer-const warning
  for the comparison constructor's deferred instance reference.
- In `packages/redbox-core`, qualified Node with
  `TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js --no-config --require chai --require test/setup.ts --timeout 5000`
  and `test/services/{NamedQueryService,ReportsService,IntegrationAuditService,HarvestRunService,SolrSearchService}.test.ts`,
  `test/controllers/RecordAuditController.test.ts`,
  `test/services/figshare-vocabulary-config.test.ts` — **230 passing**, 0 failing,
  0 pending. Log: `p5-query-regression3.log` under ignored `.tmp/sails-retirement/`.
- In that package, the same loader without legacy setup, required
  `HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http` and
  `HTTP_READ_SOLR_PORT=$(docker port sr-p5-solr 8983 | cut -d: -f2)`,
  `--timeout 45000 test/http/QueryReadsMongo.test.ts test/http/CompiledPilotMongo.test.ts`
  — **16 passing**, 0 failing, 0 pending. Includes real Mongo snapshots/diffs,
  named-query counts/projection, report paging/CSV, preview non-persistence,
  harvest detail/events, SIEM tenant filtering, unauthenticated401, wrong brand/role,
  inaccessible objects, malformed parameters, backend failure/recovery, CSRF,
  Solr scope bypass attempt, and abort/shutdown ownership.
- That HTTP suite actually invokes Bruno against the listening host using
  `test/http/fixtures/bruno-query-reads`: **2/2 requests, 2/2 tests passed**.
- `node support/specs/sails-retirement/evidence/route-inventory.cjs` — passed:
  SR-033 **25/25**, total **100/333** standalone declarations.

Final logs: `p5-query-build-final.log`, `p5-read-storage-build.log`,
`p5-query-types4.log`, `p5-query-lint2.log`, `p5-query-http-final2.log`.
Earlier diagnostics: extraction230 tests initially had6 failures (old Solr query
assertions plus audit envelope/private helper parity); those were corrected.
First Mongo fixture omitted core storage-query readiness (9 pass/5 fail); explicit
initialization fixed it. One attempted rerun raced a clean build and failed to load
an absent compiled artifact; the final run was sequential after build completion.
No timeout or skip was added to hide these failures.

## Limits and remaining dependencies

SR-035/036 own writes/indexing/harvesting and producer lifecycles; none are mounted
here. Tests cover database reports plus real Solr fuzzy reads; external institution
report targets, custom search providers, live Figshare and populated delivery/trace
provider profiles remain integration/release matrix work. Existing trace/Figshare
regressions passed; a live external integration is not claimed. Full Mongo-backed
`test:core` is recorded in the final read-group evidence after SR-034.

Final source `585aa7300`: query reads reran within the **85/85** integrated real
Mongo/Solr/Keycloak HTTP suite, zero failures/pending; their Bruno requests also
passed. Full Mongo-backed core: **4408 passing, 68 existing pending, zero failures**.
See [the final read-group closeout](p5-record-reads.md#final-full-core-closeout) for
commands, pending categories and the recorded Mongo server failure/restart.
