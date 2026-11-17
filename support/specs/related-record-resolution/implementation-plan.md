# Related-record resolution: implementation and orchestration plan

Status: RR-01–RR-22 completed; generic implementation handoff verified with recorded
baseline exceptions. Deployment migration remains separate. See [verification.md](verification.md).

Start with the [agreed scope](../related-record-resolution-plan.md), then the
[detailed design](design.md). The [task list](tasks.md) contains the assignable
work items and their dependency graph. Concrete task IDs below are stable.

## 1. Delivery strategy

Deliver one complete generic plan/activity workflow covering configurable forms
and backend operations. Preserve all existing behavior unless a form or consumer
explicitly opts in. Use small reviewable changes, with shared contracts first and
persistence safeguards in place before enriched records can be written back.

The principal implementation tracks are:

| Track | Responsibility | Shared-file coordination |
| --- | --- | --- |
| Core contracts/resolver | DTOs, `relatedTo`, storage queries, authorization and shared helpers | One coordinator owns public exports and `RecordsService` integration |
| Persistence/schema | Runtime stripping, transient display descriptors, writes and schemas | Serialize changes to the core save pipeline and record compiler |
| Form lifecycle | Existing component, fetching, rendering, serialization and readiness | One form coordinator integrates changes to `form.component.ts` and event consumers |
| Backend consumers | Email, DOI, validation and PDF adaptations | Email/DOI can proceed independently after resolver types settle |
| Queries/examples/verification | Existing named queries, dev examples and end-to-end evidence | Reuse fixtures and avoid changing established demo forms implicitly |

These are assignment boundaries for an implementation orchestrator, not new
runtime services. No agents or implementation runs are launched by these documents.

## 2. Prerequisites and baseline

RR-01 records the current HEAD, worktree state, relevant documentation and exact
commands before code changes. The original investigation used `d7b7eb479`; treat
that as a reference, not a reason to discard later changes.

Read root `AGENTS.md`. Use wiki guidance for service registration, forms, event
ordering, record schemas, concurrency and tests. Existing documentation contains
some old relationship semantics; current typed contracts and behavior decide the
implementation baseline.

Record baseline failures distinctly from new failures. An earlier broad Mocha run
hit a missing `express-rate-limit` install; do not assume that problem still exists
or report historical successful tests as current evidence. Use focused suites to
avoid loading unrelated tests, then run the appropriate package/CI checks.

Use current pinned dependencies. No new package is expected for this feature;
reuse existing JSON Pointer, Lodash, RxJS, template and testing utilities. Any
necessary dependency change must follow the repository's exact-version policy.

## 3. Stages and gates

### Stage A: contracts and safe resolver foundation

Tasks: RR-01 through RR-05 and RR-08. Descriptor compilation starts after RR-02
and is needed by RR-05 to detect unsupported calculated-source chains.

Deliver:

- Shared result/request DTOs and optional runtime record property.
- Small `relatedTo` additions for reference extraction and metadata projection.
- Explicit envelope exclusion across core and Mongo write boundaries.
- Bounded tenant/ACL-aware direct relation queries.
- Existing-service resolver/enrichment wrappers, accepting OID or supplied candidate.

**Gate A:** contract/config type checks pass; resolver tests cover reference shapes,
projection, permissions, safe failures, limits and deterministic order. Storage
tests prove `relatedMetadata` cannot persist through native writes. Raw reads and
graph responses remain unchanged. Do not expose new writeback behavior before
runtime exclusion is merged.

### Stage B: form/API path and authoritative transient writes

Tasks: RR-06 through RR-12, following their listed dependencies.

Deliver:

- Shared server visitor path and compatible legacy inline rendering.
- Explicit API enriched read, session refresh and typed client helper.
- Authoritative transient-field descriptors and configuration fingerprints.
- Server save rules and applicable write-schema behavior.
- Component fetching/events/render refresh, plus browser submission/conflict projection.

**Gate B:** a hidden or visible source populates existing scalar/group/repeatable
controls after data arrival, refreshes unsaved references and suppresses stale
responses. Source edits appear on reload without root writes. Replace/merge/API/
internal paths cannot introduce display copies; unrelated saves preserve retained
metadata. Unchanged forms and existing getters/expressions have regression coverage.

Do not enable new form versions in a deployment with only the UI portion merged.
Server declarations and write protection must ship with them.

### Stage C: backend operations and current-value queries

Tasks: RR-13 through RR-17. Email/DOI work may start after Stage A; validation and
PDF work have the additional task dependencies documented in the task list.

Deliver:

- Email rendering with current related data and original-record return semantics.
- DOI mapping enrichment isolated from normal DOI/citation writeback.
- Related-data/render readiness and an opt-in PDF wait.
- Separate validation related-data inputs with required/optional behavior.
- Narrow reuse of existing named-query source filtering for the generic example.

**Gate C:** required-source failure prevents its dependent output before sending
or minting; optional data follows configuration. Existing post-hook commit/failure
semantics remain unchanged. PDFs wait for delayed fetches and completed repeatable
population. Query predicates apply before count/page and see current source dates.

Backend integration is part of this release, not a deferred form-only follow-up.

### Stage D: complete examples and integration evidence

Tasks: RR-18 through RR-20.

Deliver a generic single/multiple activity example, role-specific presentation,
email/DOI mappings, PDF configuration and a related-source date query. Reuse a
shared fixture vocabulary across backend and browser tests.

**Gate D:** execute a scenario where only an activity changes, then obtain updated
form/API/email/DOI/PDF inputs and a changed date-query match while the plan's stored
metadata, revision, modified date and edit audit remain unchanged. Separately prove
that an ordinary local edit and an intended DOI writeback still save normally.
External email/DataCite calls use test doubles or local test transports.

### Stage E: documentation, rollout and completion

Tasks: RR-21 and RR-22.

Deliver configuration/service examples, API reference updates, migration checklist,
test evidence and a release summary with any certified unsupported query/storage
shapes. Feature opt-ins remain absent from existing configurations by default.

**Gate E:** all prerequisite tasks are complete, touched-package checks and relevant
integration tests pass, and the release evidence maps to every agreed acceptance
check. A configured first workflow is complete only when its required consumers
and discovery queries have migrated.

## 4. Assignment and merge rules

1. Assign only tasks whose dependencies are complete. A fixture/type dependency is
   still a dependency even when an implementer could guess the intended shape.
2. Parallel work starts after RR-02 fixes DTOs, relation options and target flags.
   Contract changes after that point require a coordinated update to all consumers.
3. Give each task its task brief plus `design.md`, relevant wiki pages and dependency
   results. Preserve the agreed scope and existing extension points.
4. Respect the shared-file locks in the task list. Independent email/DOI work is
   suitable for parallel assignment; concurrent rewrites of `RecordsService` are
   not. A shared file can be integrated by one coordinator after leaf helpers land.
5. Complete meaningful tests with the behavior they verify. Final integration tasks
   supplement those tests; they are not an excuse to postpone all testing.
6. Keep review units coherent: types, runtime wiring, schemas and changed tests
   must agree. Avoid committing regenerated artifacts from unrelated packages.
7. Record unresolved baseline/tooling failures in task results. Do not mark a task
   complete solely because tests could not run or because its code compiles.
8. Do not introduce source-change business triggers, approval infrastructure,
   persistent source projections or new expression precedence as a shortcut.

Recommended merge units:

| Unit | Tasks | Enablement |
| --- | --- | --- |
| Contracts/guards | RR-01, RR-02, RR-03 | No new consumer enabled |
| Shared resolution | RR-04, RR-05 | Callable with explicit options |
| Form contract and writes | RR-08, RR-09, RR-10 | Keep new examples disabled until UI lands |
| Form data lifecycle/API | RR-06, RR-07, RR-11, RR-12 | New form versions can be tested safely |
| Consumers | RR-13, RR-14, RR-15, RR-16, RR-17 | Opt-in per operation/query |
| Complete workflow | RR-18, RR-19, RR-20 | Development/test example |
| Release handoff | RR-21, RR-22 | Deployment migration remains explicit |

Units need not become exactly seven PRs. The dependency and release gates matter
more than the count. Creating or publishing PRs is a separate execution action.

## 5. Validation commands

These are commands for the implementation run. They have not been run merely by
writing the design. Build local shared packages first when tests consume their
`dist` exports. Run from repository root unless the block changes directory.

### Types and packages

```sh
npm --prefix packages/sails-ng-common run compile
npm --prefix packages/redbox-core run build
npm --prefix packages/sails-hook-redbox-storage-mongo run build
npm --prefix packages/sails-hook-redbox-pdfgen run compile
npm run test:config-types
npm run test:sails-ng-common
npm run test:record-contracts
npm run validate:api-routes
```

Use targeted type/format checks while developing; do not repeatedly rebuild all
packages after an unchanged successful check. Angular and dev-hook builds use
their existing project/package commands after shared packages are available.

### Focused core regression and new tests

Proposed new suites live under `packages/redbox-core/test/related-records/`.

```sh
cd packages/redbox-core
npm test -- --no-config --node-option no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai --require test/setup.ts \
  'test/related-records/*.test.ts' \
  test/visitor/related-object-data-inline.visitor.test.ts \
  test/controllers/RecordRelationshipsAuthorization.test.ts
```

Run focused cases in existing `RecordsService`, `EmailService`, `DoiService`,
record-contract and named-query suites for their tasks. Then run the applicable
package suites and existing record-schema/concurrency regression checks.

### Storage and actual Mongo evidence

```sh
npm run test:storage-mongo
MONGO_CONCURRENCY_TEST_URL=mongodb://127.0.0.1:27017 npm run test:storage-mongo
```

The second command requires a local test Mongo instance. Existing integration
conventions create/drop a uniquely named test database. New storage integration
coverage should follow that convention and the same environment variable. A skipped
Mongo suite is not evidence that native persistence and query ACL behavior passed.

### Angular and PDF tests

```sh
cd angular
npm exec -- ng test @researchdatabox/form --watch=false --browsers=ChromeHeadless
```

Run `@researchdatabox/portal-ng-common` tests when its record client changes.
The repository's `npm run test:angular` wrapper is the supported broader alternative.

```sh
npm --prefix packages/sails-hook-redbox-pdfgen run test:unit
```

Test readiness with an actual delayed page and asynchronous repeatable population
in the existing PDF/browser test infrastructure, not only a mocked pending flag.

### Runtime integration and browser journey

```sh
RBPORTAL_MOCHA_TEST_PATHS="test/integration/services/RelatedRecordResolution.test.ts" \
  npm run test:mocha:mount
npm run test:playwright:mount
```

The related-record integration and browser files are new task deliverables. Reuse
the existing Docker, bootstrap, login and fixture helpers; do not build a second
test application. Follow the wiki's current setup for compiled packages and local
services. Mock outbound mail/DOI services and use an isolated test datastore.

## 6. Rollout and rollback

1. Deploy code with opt-ins absent. Confirm raw reads, old forms, templates,
   lookups, hooks and PDF readiness behavior remain unchanged.
2. Configure relation projections and new form versions in development. Include
   compatible declarations in every workflow stage a migrated record can enter.
3. Enable the shared result in a consumer inventory: UI view/edit, API clients,
   email trigger/recipient/body, DOI create/update, PDF, validation, exports/jobs,
   dashboards and discovery queries that used copied fields.
4. Compare outputs and current-source discovery. Source read access must be valid
   for the operation's effective principal, including authenticated PDF pages.
5. Retire a deployment's copy writer only after its complete affected consumer set
   passes. Existing canonical copies can remain untouched during this migration;
   destructive cleanup is not part of core rollout.
6. Roll back through explicit form/consumer configuration. Existing raw reads and
   unmigrated forms remain available. Preserve compatibility declarations across
   workflow transitions; do not silently remove an active transient rule.
7. If returning to copy-based consumers, restore their synchronization process and
   required data through that deployment's migration procedure. Disabling new reads
   alone does not make old copies current. Do not automatically materialize fetched
   values into records as a rollback side effect.

## 7. Completion record

Each completed task reports changed files, behavior, tests/results, baseline issues
and remaining blockers. RR-22 produces a final evidence table mapping acceptance
checks to test names/commands, records unsupported adapter/query shapes, and lists
any deployment work still required before a real copy writer can be retired.

The feature is complete when the complete generic workflow and compatibility gates
pass. Deployment-specific business rules and migration are explicitly separate;
they must not be represented as already implemented by core.

RR-22 completion record: [verification.md](verification.md). Current functional checks
and reviewed RR-19/RR-20 evidence are recorded. The discovered lint defect was fixed
by the orchestrator; core build, lint, Effect typecheck and Mongo-enabled core suite
reruns pass. Gate E implementation handoff is complete with recorded baseline
exceptions. Deployment consumer migration and copy-writer retirement remain separate.
