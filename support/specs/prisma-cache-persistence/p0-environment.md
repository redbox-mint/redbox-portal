# P0 environment, versions and build entry points

Recorded 2026-10-19 Australia/Adelaide (2026-10-18–19 UTC). Source baseline:
`f6668358d148e09f77fd335bd9941ddaa9dbe949`. These are observed versions and
candidate versions, not an assertion that the full matrix is qualified.
No dependency, lockfile, Dockerfile or production configuration changed in P0.

## Node, compiler and module matrix

| Path | Declared version / behavior | P0 evidence |
| --- | --- | --- |
| Host | `.nvmrc`: Node 24.16.0 | Actual `node -v`: v24.18.0; `npm -v`: 12.0.2; Linux x86_64; Docker server 29.6.1 |
| CircleCI | Repeated `cimg/node:24.16.0@sha256:907e03ea220172ca67bc14706907afa6df26d50298393b7e62f0a16fffe5f347`; one unpinned Node 24.16.0 job | Source audit only; did not run CircleCI |
| Dockerfile base/builder | `node:26.11.1-bookworm` | Source audit; full image build not run |
| Dockerfile runtime | `node:26.11.1-bookworm-slim` | Source audit; full image build not run |
| Mocha/Bruno image default | `qcifengineering/redbox-portal:develop` | Existing local image `07120382d99c` actually reports Node v26.7.0; this is not evidence for the current Dockerfile's Node 26.11.1 |
| Root TypeScript | 5.9.3; NodeNext module + resolution; strict false | Root `tsc -p tsconfig.json` passed |
| Core TypeScript | 5.9.3; NodeNext module + resolution; strict true | Core package build passed on host Node 24.18.0 |
| Shared base config | `packages/redbox-dev-tools/config/tsconfig.base.json`: @tsconfig/node24, target/lib ES2024, esModuleInterop, skipLibCheck, experimentalDecorators, emitDecoratorMetadata | Existing configuration retained |
| Root/core package module type | No `type: module`; NodeNext emits CommonJS for these `.ts` sources | Built core `dist/index.js` uses CommonJS; package entry `dist/index.js`, types `dist/index.d.ts`, npm files includes dist |
| Core tests | Mocha 11.7.6, ts-node 10.9.2, transpile-only, test/tsconfig.json | `.mocharc.js` disables native Node TS stripping and preloads Chai/setup; full suite has the startup timeout recorded in validation |
| Root Docker Mocha runner | `run-mocha-redbox.sh`: ts-node transpile-only, explicit `module: commonjs`, `moduleResolution: node`, nyc | Separate from production NodeNext build; not suitable proof of Prisma package type resolution |
| Other infrastructure | Playwright container declares `mcr.microsoft.com/playwright:v1.64.1-noble`; general/OIDC/S3 Bruno and Playwright stubs select Node 24.16.0; PDFgen Bruno selects Node 24.14.1; hook archetypes also select Node 24 | Source inventory, not a complete Node support policy or a tested Node matrix |

The wiki still has a stale `redbox-core.md` link. P0 read the existing
`Redbox-Core-Types.md` page plus Architecture, Services, Loader, Automated Tests,
Coding Standards and AGENTS.md. Current source takes precedence where wiki/skills
still name `redbox-core-types`, old test variables or older module settings.

Installed cache-related versions resolved from the core package: Sails 1.5.18,
sails-hook-orm 4.0.3, Waterline 0.15.2, sails-mongo 2.1.2 (its nested MongoDB
driver 6.3.0), native core MongoDB driver 7.7.0, node-cache 5.1.2, Luxon 3.7.2,
RxJS 7.8.2, connect-mongo 6.0.0. Root resolves native mongodb 7.2.0; do not
mistake the root driver version for the core's or sails-mongo's driver. Agenda
6.2.6 and @agendajs/mongo-backend 4.0.3 are exact manifest pins. P0 did not add
an ORM/driver dependency.

## Compilation and packaging audit

Every future contract-generation integration must account for these paths:

1. Root `compile:core` and `compile:core:prod` each run a core-local npm install
   followed directly by `node_modules/.bin/tsc`, bypassing package `build`.
2. Core `build` runs `rm -rf dist && tsc`. Artifact copying must happen after
   this clean, and contract declarations must exist before consumers compile.
3. Root `compile:server` and `compile:all` call `compile:core`; `compile:all`
   also builds RVA before core. Development `prepareLocalDev.sh` calls
   `compile:core`; `dev:all` only builds Sails/Angular, so it is not a substitute
   for preparing updated core output. `dev:run*` can mount whatever dist exists.
4. Dockerfile directly runs `npx tsc -p tsconfig.json` inside core at line 42,
   then root tsc at line 54. A future prebuild hook alone misses this path.
5. CircleCI's API docs, core-test and other package/build jobs invoke root
   compile scripts; the container build has the direct Docker path. Audit
   `.circleci/config.yml` again when generation is implemented.
6. Core package `main/types/files` point at dist. Docker production-dependencies
   removes package-local node_modules then runs root `npm ci --omit=dev`; runtime
   copies packages and root node_modules. Runtime artifacts and the runtime ORM
   must survive this, without a generation CLI or source-tree/CWD resolution.

P0 used locked root dependencies with scripts disabled, compiled existing local
packages using tsc, and ran core `build`. That is not a clean packed-install,
Prisma-contract freshness, production pruning or full Docker-build proof. Those
remain P1/P4. No database was needed to compile the existing package.

## MongoDB image inventory

Server versions below were queried only from newly created containers or from
`docker run --rm --entrypoint mongod <image> --version`. Existing development
MongoDB data and its running container were not accessed.

| Image / source | Physical server evidence | Consequence |
| --- | --- | --- |
| P0 capture: `mongo@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907` | `mongo:8.0` pull resolved to 8.0.34; isolated server and buildInfo recorded in EJSON | Reproducible P0 test image, not final P4 infrastructure selection |
| `mongo:latest@sha256:bac22ea7710d774103dcad3ec8ac13cba1eb378f488e3ce8a6b3a1adf2ba9dcc` | `mongod --version`: 9.0.2 | Used by root development, generic integration, Mocha and core Bruno; latest label must not be interpreted as 8.x |
| `mongo:latest@sha256:e0ce8c35124d4a9f9785532d1f268f39e9728ffa1cb38f46fa482436424c4bd3` | `mongod --version`: 8.2.12 | Used by Bruno general/OIDC/S3 |
| `mongo:7.0.43-jammy` | Playwright Compose source pin; server not started by P0 | Below the proposed MongoDB 8+ minimum |
| `mongo:7` | PDFgen development and API integration Compose; hook-archetype development/Mocha templates; existing local development image label | Floating tag, below proposed minimum; existing server not queried |
| `mongo:7.0` | CircleCI Figshare-test docker run and storage-mongo executor | Floating patch tag, below proposed minimum; not run here |
| `mvertes/alpine-mongo:latest` | Old deployment example and acceptance-testing Compose | Unverified legacy version; do not claim it meets 8+ |

Relevant files: root `support/development/docker-compose.yml`,
`support/integration-testing/docker-compose{,.mocha,.bruno,.bruno.general,.bruno.oidc,.bruno.s3,.playwright}.yml`,
`packages/sails-hook-redbox-pdfgen/support/{development,api-integration-testing}/docker-compose*.yml`,
`packages/redbox-dev-tools/templates/hook-archetype/standard/support/{development,integration-testing}/docker-compose*.hbs`,
`.circleci/config.yml`, and legacy `support/{acceptance-testing,deployment-examples/docker}`.

The P0 server is standalone, unauthenticated, isolated and ephemeral. No replica
set was required by the Waterline test. P1 must determine requirements of the
selected Prisma runtime rather than importing Prisma 6 transaction assumptions.
Neither authentication/TLS, replica sets, production topology, shared-client
upgrade smoke tests nor MongoDB engine/FCV upgrade/downgrade is qualified here.

## Actual npm ORM candidates and maturity

Read-only registry output is archived in
[evidence/npm-versions.json](evidence/npm-versions.json), queried 2026-10-18 UTC.

- **Prisma CLI candidate:** `prisma@8.0.0-rc.23` (`latest` at query time).
  Engine range declared upstream is `^22.18.0 || ^24.11.0 || >=26.0.0`.
  This is a release candidate, despite the latest tag.
- **MongoDB runtime candidate:** `@prisma/orm-mongo@8.0.0-rc.18` (`latest`).
  It declares `type: module`; the queried package has no engines field. Upstream
  calls MongoDB **early access**, separately from the ORM/CLI RC status.
  CLI/runtime versions are intentionally independent. P1 should test/pin this
  exact pair if it remains the chosen candidate, with applicable lockfiles.
- `@prisma/orm-target-mongo@8.0.0-rc.18` exists but is not a substitute name for
  the public runtime facade. `@prisma/client@7.10.1` belongs to Prisma 7, not the
  Prisma 8 TypeScript contract/runtime workflow. `@prisma/orm` returned npm E404;
  do not install a guessed package name.
- **Alternative assessed:** `@mikro-orm/mongodb@7.2.5` and core 7.2.5, current
  stable npm versions, ESM packages, Node >=22.17.0; MongoDB dependency 7.7.0.
  Queried `@mikro-orm/core@6.6.17` declares Node >=18.12.0 and separate import/
  require exports. That older major remains a separate version/support decision;
  P0 did not install or qualify either major version.

Primary sources read on the capture date:

- [Prisma release status](https://www.prisma.io/docs/orm/release-status): RC,
  independently versioned CLI and runtime packages; Prisma 7 client distinction.
- [Prisma supported databases](https://www.prisma.io/docs/orm/supported-databases):
  MongoDB early access; MongoDB transactions are not yet implemented in Prisma 8.
- [Prisma CommonJS setup](https://www.prisma.io/docs/cli/orm-init#in-a-commonjs-project):
  retain CommonJS package semantics with NodeNext; avoid blindly accepting init's
  package.json/tsconfig edits. Existing NodeNext does not by itself prove packed
  runtime compatibility; generated JSON/declarations still need explicit checks.
- [MikroORM MongoDB](https://mikro-orm.io/docs/usage-with-mongo): native ObjectId
  plus serialized string ID, native operations, indexes and transaction topology.

**Official v6 readiness is not met:** no stable Prisma 8 CLI and supported stable
Prisma 8 MongoDB runtime were identified. RC/early-access evaluation may proceed
on next. Recheck maturity before release; do not substitute permanent Waterline
fallback as the official v6 result.

## Designated previous development release for rollback tests

Designate **`next@0cfbd62b93260b63ad907d7c01ed9f33a2af619e`** (2026-10-19
Adelaide), the last development implementation before the spec-only commit.
Its core manifest is `@researchdatabox/redbox-core@0.0.1-beta.9022`; root is
`redbox-portal@2.1.0`. The immutable Git SHA, not that reused package version or a
floating Docker develop tag, identifies this development snapshot/release.
This designation is a source release target; no published immutable image was
identified or claimed qualified for it in P0.

P5 must build/deploy that exact source snapshot (archive its image digest), use
the same unchanged MongoDB 8 server and Prisma-written documents, then exercise
read/update/delete and notification/preview behavior after observing completed
writes. Test explicit backend switching separately from redeploying this older
snapshot, which does not know the future backend setting. P0 did not perform
this rollback rehearsal. This is not a promise of v5 rollback or engine downgrade.
