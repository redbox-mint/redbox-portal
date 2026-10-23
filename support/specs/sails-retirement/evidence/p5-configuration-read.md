# SR-032 — Configuration, form metadata and translation API read slice

## Scope and source

**Partial SR-032.** Six read contracts run on the standalone Express 5 host:
AppConfig get, translation entries list/get, translation bundle get, forms list/get.
The route inventory marks these six exact declarations standalone. It does not
mark the remaining dashboard, browser form, localization, workspace or protected
write routes complete. The dashboard editor page belongs to SR-040; its inventory
assignment is corrected without claiming a replacement implementation.

Domain extraction: `68252600d`; SR-031 foundation: `f0c138a4d`, on
`stack/sails-retirement`. This record accompanies the read-adapter commit; its
closeout records that source SHA and the final full regression result. The released reference remains v5.0.4
`c1dda53999f3b026347008731f33dba834e06c27`, with image/runtime provenance in
[p0-released-v5.md](p0-released-v5.md). These are partial-host tests, not a deployable
institution portal or completed browser qualification.

## Owned implementation and retained behavior

Moved the existing AppConfig/secrets, configuration-model registry,
translation-entry, forms, record-validation and form-visitor implementations once.
The comparison services delegate to those implementations through `compat/sails`;
converted instances bypass the process-wide service cache and belong to the
comparison application. The owned modules receive repositories, configuration,
logging and narrow operations. Filesystem form-registry/shim discovery remains
only in the comparison adapter; owned forms receive resolved declarations.

AppConfig schemas finish during awaited initialization. Defaults/overrides,
secret masking, dynamic persisted changes, per-instance model registrations and
secret-store cleanup remain explicit. Translation changes await their existing
best-effort reload collaborator so accepted work remains tracked. No dependency
versions changed.

Form reads preserve their summary/missing-result envelopes and editable string
coercion, strip server-owned operation policies, and return sanitized operation
discovery only after the existing record, form, brand, actor and workflow checks.
The same extracted validation resolver is used by the comparison service. The
read-slice fixture exercises a real persisted starting workflow and actor-role
restriction; it does not simulate a successful validation-service response.

Shared record view/edit/transition evaluators were moved to `records/access.ts`
for this discovery dependency. The legacy adapter still supplies the selected
`RolesService.getRole` operation, preserving hook overrides. HTTP branding loads
populated brand roles; actor roles are authoritative credential-safe snapshots
including their stored names. No record mutation or export route was added.

The six new read contracts use the authenticated API policy chain. The design's
break list explicitly includes their 401 Bearer challenge and required target-brand
membership, as already used by the pilot. Generic `checkAuth` retains SR-031's
legacy no-rule/default-role/denial/event semantics and cached path-rule source.
Operational repository failures are sanitized by the owned host.

Express 5 wildcard captures are normalized into a decoded slash-containing
translation key before existing Zod validation. Read routes retain API-version
negotiation and cache headers, support HEAD/OPTIONS and mounted root contexts,
and reject malformed URI/query input. The adapter calls domain operations and
never calls a legacy controller or retries through Sails.

## Executed checks

Same disposable standalone MongoDB **8.0.34 / FCV 8.0** and Docker image as
[p5-route-groups.md](p5-route-groups.md), port **127.0.0.1:34903**. Each HTTP fixture
creates/drops its own `sr_p4_http_<pid>_<counter>` database. Node **26.11.1**, npm
**11.20.0**, TypeScript **5.9.3**, Mocha **11.7.6**, ts-node **10.9.2**, Express
**5.2.1**, Mongo driver **7.7.0**, Bruno **3.5.2**, Prisma ORM **8.0.0-rc.19** / CLI
**8.0.0-rc.24**. No institution/replica-set qualification is inferred.

All commands use:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
```

```sh
npm --prefix packages/redbox-core run build
./node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
npm --prefix packages/redbox-core run typecheck:application
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-configuration:mongo
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/services/AppConfigService.test.ts test/services/AppConfigSecrets.test.ts test/services/I18nEntriesService.test.ts test/services/FormsService.test.ts test/services/RecordValidationService.test.ts test/services/RecordValidationContractContext.test.ts 'test/visitor/*inline*.test.ts' test/unit/validator.visitor.test.ts
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/services/RecordsService.test.ts
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 15000 test/unit/startup-module-loading.test.ts
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-pilot:mongo
node support/specs/sails-retirement/evidence/route-inventory.cjs
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
npm run lint
git diff --check
```

The configuration Mongo/HTTP suite: **11 passing, 0 failing/pending**. It covers all
six read contracts, defaults/masking/invalidation, literal/encoded slash keys,
missing results, form policy redaction/discovery, unauthenticated/wrong-role/
wrong-brand denials, malformed input, versions/headers, HEAD/OPTIONS, a resolved
extension replacement, backend failure, separate application/model caches and
client-abort/shutdown draining. The accepted read and its cache survive transport
termination until the operation settles. The fixture then observes cleanup.

The existing Bruno form requests selected in the released-v5 evidence run against
this standalone host: **2 requests / 4 tests passed, zero failures/skips**. The
collection files/assertions were reused unchanged. The source host's loaded graph
contains no Sails, controllers, compatibility modules or core barrel. The compiled
pilot's guarded graph additionally imports the new configuration/forms/translations
entrypoints, while retaining its real Mongo HTTP/lifecycle checks.

Focused existing AppConfig/translation/form/validation/visitor regression:
**336 passing, 0 failing/pending**. Existing RecordsService regression after the
role-lookup correction: **314 passing, 0 failing/pending**. Isolated startup
regression: **1 passing**, child completed in **10.2 seconds**. Build with actual
Prisma generation/copy, incremental production compile and strict application/
HTTP-test typecheck passed. Final focused lint: **917 source files, zero errors/warnings**. The compiled
Mongo/HTTP pilot passed **24 tests, zero failing/pending**, including the expanded
entrypoint guard. Inventory generation/check and diff check passed.
Ignored logs are under `.tmp/sails-retirement/p5-*`.

## Failures investigated and remaining boundaries

An initial strict check caught the editor class-policy input shape, moved relative
imports and the older workflow DTO's broad types; these were corrected. An initial
HTTP denial helper tried to parse the intentionally empty 403 body; it now reads
that public response accurately. No security assertion was weakened.

The first Mongo-backed full core run had **4401 passing / 68 pending / 7 failing**.
Six failures exposed a real extraction regression: using the built-in role lookup
had bypassed comparison `RolesService.getRole` overrides. Restored that explicit
collaborator; all **314 existing RecordsService cases pass**. The seventh failure
was the startup child timing out at 12 seconds while other verification was
running; its isolated unmodified test passed in 10.2 seconds. A final sequential
full-core rerun is required; the initial failing run is not acceptance evidence.
The 68 pending cases do not count as Mongo or provider coverage.

This fixture supplies no HTML-field sanitizer, vocabulary backend or translation
runtime-cache implementation: those inputs fail explicitly if unexpectedly used,
and its forms contain no such fields. Existing legacy suites retain real HTML/
vocabulary behavior coverage. Remaining browser/localization/dashboard routes
must bind and exercise those owned collaborators before SR-032 is complete.
Protected write adapters remain gated on SR-039. No SR-033/034 read group,
SR-038 provider or SR-039 CSRF acceptance is claimed by this slice.
