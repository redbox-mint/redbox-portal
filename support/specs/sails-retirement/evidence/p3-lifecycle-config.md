# P3 configuration and lifecycle evidence

Starting source: `247db6dafc2551527e972e238ff1504f4687a3a5`, shared checkout,
branch `stack/sails-retirement`. P0–P2 implementations are reused. No P4 work.
Commands below run at the repository root unless specified. Local logs live in
ignored `.tmp/sails-retirement/p3-*.log`; raw logs are not committed.

## SR-019 — Startup resolution and finalization

`src/configuration` owns explicit core → low/high extension → application → selected
environment → local → supported environment input → supported CLI input resolution.
The composition supplies a typed Zod configuration schema and explicit input
bindings. It validates each merged contribution, rejects unsupported keys through
the schema, and reports only source/path/error code (never values or Zod messages).
Functions require both a declared executable path and their typed schema position.
Ordinary and branding arrays replace; Agenda arrays/maps normalize and merge by
job name. Undefined means no contribution; null remains explicit and is validated.
The owned frozen snapshot does not mutate/freeze declarations or clone through JSON.

`loadStartupConfiguration` awaits explicit ESM or CommonJS data files. It does not
scan Sails config directories, import generated shims, run bootstrap, copy assets,
or acquire clients/workers. Native ESM top-level await is exercised. Extension
registration and these config modules remain separate from domain initialization.

Qualified toolchain for root commands:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
node --version
npm --version
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only packages/redbox-core/test/configuration/resolution.test.ts
npm run lint
```

Observed initial focused run: **5 passing, 0 failing, 0 pending**; clean core build
**exit 0**, including Prisma generation/copy. Existing Prisma typeless-package and
unsynced agent-skill notices remain. The compiled import test denies Sails loading,
socket connects/listens and checks that signal listeners, compatibility/CoreBase
and the legacy core barrel are absent. Production config defaults/deployment input
bindings follow in SR-020; runtime/business composition follows SR-022.
No dependency version or lockfile change.

Final SR-019 focused rerun: **5 passing / 0 failures / 0 pending** (119 ms).
Strict application typecheck and Node 26 incremental core TypeScript compile
**exit 0**; repo lint **873 files, 0 warnings/errors**, focused Prettier and
`git diff --check` **exit 0**. The first incremental compile used an incorrectly
relative PATH from the package directory and thus Node 24; it passed, but is not
target qualification. It was repeated with the absolute Node 26 PATH and passed.
The clean build, strict typecheck, focused tests and lint all used Node 26.11.1.

## SR-020 — Deployment conversion and diagnostics

SR-019 source: `504b83ea3`. `configuration/deployment.ts` adds an explicit typed
operational schema, shared pure defaults, exact canonical environment/CLI bindings,
and deterministic data/legacy-environment conversion helpers. It reuses the existing
Mongo connection/session resolvers offline. It does not load `rc`, arbitrary Sails
files, hooks, sessions or workers. The legacy Agenda module and new resolver share
pure default options; only the comparison module retains import-time env behavior.

[Implemented mapping and examples](../configuration-v6.md) classify connections,
sessions, local/OIDC/AAF bootstrap data, proxy/root paths, disks, both characterized
Agenda spellings, custom environment files and unsupported keys. A composition
extends the deployment schema with its actual typed domain sections; this is not
full auth/provider parity or a promise to load every old Sails key. Conversion
fixtures are synthetic and credential-free; institution designation remains
SR-005 and is not invented to complete this implementation task.

Additional commands, qualified Node 26 PATH as above:

```sh
# In packages/redbox-core, with the ABSOLUTE Node 26 toolchain PATH:
./node_modules/.bin/tsc
# From repository root:
npm --prefix packages/redbox-core run typecheck:application
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require ./packages/redbox-core/test/setup.ts 'packages/redbox-core/test/configuration/*.test.ts' packages/redbox-core/test/config/agendaQueue.test.ts
npm run lint
git diff --check
```

Results: incremental production build and strict application typecheck **exit 0**;
focused config/legacy Agenda **11 passing, 0 failing/pending** (699 ms); repository
lint **875 files, 0 warnings/errors**, diff check **exit 0**. The compiled offline
import guard runs against the deployment surface too. Initial expanded run:
**10 passing / 1 failing** because an over-broad test regexp matched MongoDB's
`@mongodb-js/saslprep/dist/index.js`. A direct loaded-module probe identified that
exact dependency; the assertion now targets core's barrel/compat/CoreBase paths.
The same complete focused command then passes; no acquisition assertion removed.
No dependency version, lockfile or runtime-module-format change.
