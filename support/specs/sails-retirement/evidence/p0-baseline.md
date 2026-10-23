# P0 baseline evidence

Recorded 2026-10-23 in `/home/andrew/src/github/redbox-portal`, branch
`stack/sails-retirement`. This record concerns SR-001–SR-005 only. It does not
qualify the future standalone host or begin P1. Commands below run from the
repository root unless a different working directory is specified.

## SR-001 — Integrated source and executable inventory

Baseline: `a49366803164429f9d8bdd249dadcdf856c9d13e` (spec commit), with integrated
Prisma retirement commit `717ed1b65` and parent comparison source
`59a5cb9a4e426b1d0e6c9f3256c089240bc5b0f2`. Root package version is still `2.1.0`
and core `0.0.1-beta.9022`; these strings do not identify a released v6 artifact.
`source-inventory.json` records the full source SHA, package manifests/hashes,
classification, line numbers and migration owner for every matched tracked file.

Commands actually run:

```sh
git status --short
git branch --show-current
git rev-parse HEAD
git log -8 --format='%h %s'
git submodule status
node support/specs/sails-retirement/evidence/inventory.cjs a49366803164429f9d8bdd249dadcdf856c9d13e > support/specs/sails-retirement/evidence/source-inventory.json
node support/specs/sails-retirement/evidence/versions.cjs > support/specs/sails-retirement/evidence/versions-before.json
```

The inventory command exits 0 with **1,261 matched files, 9,779 matched lines,
zero unclassified files**. Its first run found 11 unclassified tooling/entrypoint
files; their classifications were added before recording the final result.
407 files are documentation/specification/reference material, 9 lockfiles and
9 package manifests. A match is a review candidate, not proof of executable use.
In particular, `@researchdatabox/sails-ng-common` is a shared model/utility package;
its name alone is not a Sails runtime dependency. Historical evidence is reference
material, even when it embeds old commands. The script reads a fixed committed
tree, never imports the application and excludes the unrelated untracked
`support/specs/graphql-record-metadata/` directory.

Actual host at this baseline: **Sails**, via `app.js` → `generateAllShims()` →
`sails.lift(rc('sails'))`. Existing plain-owner Prisma tests are prior persistence
capability, not application-runtime extraction. There is no standalone host here.

### Surface ownership

| Existing surface and source | Migration owner / boundary |
| --- | --- |
| `app.js`, `.sailsrc`, `app.integrationtest.js`, `pm2.json` | SR-010/SR-011 host/comparison; SR-050 promotion; SR-052/SR-053 removal |
| `src/loader`, `src/hooks`, `redbox-loader-templates` in core | SR-012–SR-014 declarations/precedence; SR-018 tooling; SR-022 ledger/bootstrap; SR-051 generation |
| Core `CoreBase`, `CoreService`, service/controller export caches | SR-007/SR-008 instance ownership; SR-011 shared implementation; SR-022/SR-023 awaited lifecycle |
| Core `persistence/runtime.ts`, `groupRuntime.ts`, `shutdown.ts` | SR-006 structural owner/Sails signal adapter; SR-024 accepted work/drain/retry; SR-025 maintenance |
| Root `api/migrations` and core `MigrationRunner` | SR-022 named lexical migrations; existing bodies and ledger are not transactional or locked across runners |
| Core `RecordTypesService`, reference repositories | SR-008/SR-009 pilot; SR-029/SR-030 authenticated HTTP proof |
| Core `config`, root `config/env`, `.sailsrc`, `ConfigService` | SR-019–SR-021 explicit startup/dynamic config and imperative-effect split |
| Core `api-routes`, `policies`, HTTP/session middleware | SR-026–SR-028 contracts, effective policies, context and middleware; SR-038/SR-039 identity/CSRF |
| Configuration/forms/translations, reports/search/named queries/history, records/exports, mutations/workflows, account/integration operations | SR-031 inventory; respectively SR-032, SR-033, SR-034, SR-035, SR-036; SR-037 closure |
| `sails-hook-redbox-storage-mongo` registrations, native GridFS, staging | SR-015 readiness/capability; SR-024 lifetime; SR-041 streaming/partial cleanup |
| `sails-hook-redbox-pdfgen` Sails initializer, job declarations, generation/retry fibers | SR-016 lifecycle; SR-023 activation; SR-043 progress; SR-044 integrated drain |
| `redbox-hook-dev`, dev-tools generators/templates | SR-018 declarations/archetypes; SR-032/SR-040 forms/assets; SR-053 final generated-app checks |
| Angular `io.socket`/`sails.io.js`, EJS `res.view`/locals, hook assets/views | SR-040 rendering/static lookup; SR-043 direct sockets and coordinated clients |
| Root/package test bootstrap, Bruno, Playwright, TS loaders | SR-003 behavior fixtures; SR-030/SR-046 parity/regression; SR-053 standalone bootstrap |
| Docker, Compose, CircleCI, development/build/publish scripts | SR-002 exact execution selection; SR-047 packaged checks; SR-053 final retirement |

All core paths above are under `packages/redbox-core/`. Source inventory entries
give precise filenames and matching lines; the table gives ownership for related
indirect surfaces that need no explicit `sails` token.

### Native resources and admitted-work owners

- Persistence runtime owns Prisma clients, shared native Mongo pools and registered
  resources; group runtime owns admission and stale handles. Shutdown currently
  wraps Sails `lower`, `initialize`, `_processListeners`, SIGINT/SIGTERM/SIGUSR2.
- `middleware/redboxSession.ts` registers `sessions`; session saves and callbacks
  must drain before its store/pool closes (SR-028/SR-038/SR-024).
- `AgendaQueueService` registers `agenda`; owns workers, claims/releases, pending
  enqueues, starts, job completions and backend operations. Existing drain default
  is **30,000 ms**. HTTP/domain accepted-work scopes must survive transport aborts.
  Mongo and SQS backends are distinct (SR-023/SR-024).
- Storage hook `MongoStorageService` registers `storage-mongo-staged`;
  `StorageProtocol` registers `storage-gridfs`. Byte streams and staging cleanup
  remain admitted work (SR-015/SR-024/SR-041).
- PDF generation/retry fibers have a separate `PDFService` owner that patches
  `sails.lower()` and catches cleanup failures before continuing. This must join
  the shared observable failed-stop contract, not be assumed already covered by
  persistence resource registration (SR-016/SR-024/SR-044).
- `bootstrap.ts` starts node-schedule crons; Agenda and PDF register readiness/event
  callbacks. These are activation owners, not configuration-only declarations
  (SR-022/SR-023). Vocabulary imports are awaited bootstrap network effects.
- Core HTTP config caches session/parser/Companion middleware and socket attachment
  at module scope. Companion transfers, tus upload server/streams, portal sockets
  and session callbacks need explicit per-app owners (SR-028/SR-041–SR-044).
- Mail/DOI/Figshare/RAiD/Solr/provider callbacks are external-effect work owned by
  their domain/provider slices (SR-033–SR-036/SR-044); a stopped socket is not proof
  of a completed write or external effect.

### Generated versus institution-owned files

`app-shims-before.json` is a filesystem snapshot (SHA-256, tracked flag and generated
header detection) made by recursively reading JS/TS files under `api/` and `config/`
with Python `pathlib`, `hashlib.sha256`, and `git ls-files` membership. It found
**245 files: 236 with the loader-generated header, 9 tracked application-owned
files** (three migrations and six environment files). Generated shims are ignored
working-tree output and therefore absent from the committed-tree inventory.
A header does **not** prove an unedited file: SR-051 must compare exact generator
output before deleting anything. No generated/application file was deleted here.

Initial environment: shell Node `v24.18.0`, npm `12.0.2`, Linux amd64; Docker
Engine `29.6.1`, Compose `v5.2.0`. `docker ps` initially returned no running
containers. The wiki directory is populated; `git submodule status` returned no
entries in this checkout. The required wiki/spec files were read in full.

SR-001 conclusion: the integrated source, bounded method, generated-file snapshot
and owner classifications are captured. This is inventory evidence only; source
scanning cannot prove installed-artifact or live institution compatibility.
