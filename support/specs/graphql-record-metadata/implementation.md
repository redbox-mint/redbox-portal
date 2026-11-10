# Workflow-specific record GraphQL

This implementation promotes the shared-tree investigation into the core portal for authenticated external integrations. The [investigation](design.md), prototype, SDL and fixture evidence remain available. GraphQL was selected to support validated queries and typed clients; the investigation's REST projection comparison remains useful and does not establish a storage-read advantage. REST projection is outside this implementation.

## Grid extension

The endpoint now also provides bounded `records(...)` and authenticated `recordFields(...)` for a future visual query builder. The current contract, index migration prerequisites, workflow selections, cursor semantics and saved-grid IDs are documented in the wiki [Record GraphQL Grids](../../wiki/Record-GraphQL-Grids.md). This extension adds no UI or persistence and retains this investigation and its historical evidence. Collection execution uses live indexed capabilities and bounded candidate hydration through runtime record authorization; it returns no counts.

## Enablement and access

The loader registers `RecordGraphqlService`, `webservice/RecordGraphqlController`, the `recordGraphql` configuration and a single `POST /:branding/:portal/api/graphql` action. Set the following in a deployment's local configuration or hook configuration:

```js
module.exports.recordGraphql = {
  enabled: true,
  cacheEntries: 16,
  maxVariants: 100,
};
```

The default is disabled. No mutation, subscription, public SDL/discovery, GraphiQL, UI migration, extra relationship query or REST projection is installed. Dependencies belong to `packages/redbox-core`: `graphql` 16.14.2 and `graphql-yoga` 5.24.2, with exact pins and core/root lockfiles.

The action follows the normal Sails branding, portal, bearer/session authentication, CSP and contract validation policies. Its authorization policy additionally requires an authenticated user and an applicable path rule granting read access in the requested brand. Missing rules deny access. The default bootstrap rule grants Admin read access; existing installations can already authorize Admin through their general API rule. Integration roles require an appropriate persisted path rule for `/:branding/:portal/api/graphql`. Bootstrap configuration does not modify existing installations' persisted rules.

Every OID uses the runtime `RecordsService.getMeta` and `RecordsService.hasViewAccess`, including hook overrides. Matching usernames, view roles, and existing editor read access follow those services. Brand ownership is checked before permission evaluation. Missing and cross-brand records produce the same `NOT_FOUND` result; denied same-brand records produce `FORBIDDEN`. Metadata, authorization values and provider error messages are absent from those errors. Read-only viewers do not need edit permissions.

## Query and result

Send a JSON body containing `query`, optional `variables`, and optional `operationName`, with bearer authentication and `Accept: application/graphql-response+json`. The Sails adapter rebuilds the consumed request body for Yoga's Fetch handler; see the [Yoga integration documentation](https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-express). Results use that media type, retain GraphQL's `{data, errors}` shape independently of REST API versions, and carry `Cache-Control: private, no-store`.

For the checked-in default/rdmp publication draft form:

```graphql
query ReadPublication($oid: ID!) {
  record(oid: $oid) {
    oid
    recordType
    workflowStep
    form
    metadata {
      __typename
      ... on M_dataPublication_draft_62709f3f9062122d1c62901e260f2084131a3d6c2949e0794a487e99bf8717d7 {
        title
      }
    }
  }
}
```

The nullable `RecordMetadata` union contains a member per configured record type/workflow/form in that brand/portal. Queued and published records require their corresponding fragments. Obtain deployment-specific SDL privately with the trusted server-side `RecordGraphqlService.describeReadSchema(caller)` method; this service tooling has no public route. The caller supplies the configured brand and portal. Treat SDL distribution and client query validation as part of integration configuration management.

All metadata fields and list elements are nullable because stored records may omit them. Retired enum/vocabulary values retain their underlying scalar values. Nullable lists retain valid siblings when one historical item is invalid, with errors identifying the failed index. Numbers, booleans and strings are checked without coercion; incompatible historical values produce nullable field errors with `HISTORICAL_VALUE_TYPE`. `MetadataInteger` accepts JSON safe integers, including values outside signed 32-bit GraphQL `Int`. Unsupported components and incompatible conditional or UI-variant shapes use `MetadataJSON`; their children cannot be queried as typed fields. Empty configured forms expose an explicitly opaque `value` field.

Both compatible conditional branches contribute fields, even when today's UI would hide one branch. The compiler's optional `fieldMode: 'read'` retains fields from view and edit modes; existing write callers retain their previous edit-mode behavior. Read compilation merges fields from edit/view and role-specific definitions sharing a storage path. Compatible nested objects and repeatable rows retain their combined fields; incompatible leaves become explicitly opaque. Existing write compilation retains its ownership and role-variant rules. UI role/mode filtering is not used as a read ACL because REST exposes stored metadata after record authorization. Current form overrides and reusable definitions still determine effective stored names.

Valid GraphQL field names are preserved except the reserved `__` and `rb_` prefixes. Other names become `rb_` followed by UTF-16LE hexadecimal code units, making the mapping injective even for invalid Unicode. Each generated field description identifies its original JSON Pointer as a JSON string, keeping private SDL valid for control characters and lone surrogates. Stored metadata is never renamed. Metadata member names include readable type/workflow prefixes and a full SHA-256 of the UTF-16LE scope identity; nested object names use full pointer hashes. Duplicate variant identities fail schema assembly. Names remain stable across edits to the same form identity; removing or changing a field can invalidate existing queries.

An authorized record whose stored type/workflow/form no longer resolves remains readable through its envelope. Selecting its metadata yields `null` and `UNRESOLVED_READ_CONTRACT` rather than assigning a different workflow type. Undeclared historical fields are not added to typed object types; existing REST remains available for full stored metadata.

## Configuration and cache lifecycle

Read contracts load persisted forms in the brand, its record types, and their workflow steps, including hidden steps. They compile the configured form through `RecordContractCompiler` and the same core/hook contributor registry as record schemas. They do not invoke `RecordSchemaService.resolveUpdate`, write validation, edit authorization or artifact/grant persistence. GraphQL works independently of write-schema enablement.

Every request reloads scoped configuration and computes a bounded content fingerprint including reusable definitions. Unchanged configurations reuse the assembled Yoga/schema instance. Form, workflow and reusable-definition changes build a fresh immutable schema before use. Replacing contributor discovery state replaces the registry identity and invalidates cache reuse; invalid registration state fails closed. Hook package/configuration reload still follows the portal's normal reload/restart lifecycle.

The cache is an LRU of schema snapshots only, keyed by brand ID/name, portal, configuration fingerprint and contributor registry identity. It contains no records, callers or permission outcomes. Concurrent requests for the same snapshot share a build. Pending builds count against capacity and cannot be evicted to create unlimited parallel builds. Failed builds are removed; configuration changes detected during compilation fail that build. Defaults allow 16 entries (hard maximum 64) and 100 variants per scope. Record read promises, including denials, are memoized by OID only within one GraphQL request; later requests read and authorize again.

This avoids stale schema TTLs at the cost of form/type/workflow configuration reads per request. The selected fields reduce response size after one aggregate record read per distinct OID; this does not push projection into storage. Existing REST default responses are unchanged.

## Bounds and errors

| Bound                                                        |     Limit |
| ------------------------------------------------------------ | --------: |
| GraphQL request JSON                                         |    64 KiB |
| Parser tokens                                                |     2,000 |
| Selection traversal steps (including fragment spreads)       |     2,000 |
| Expanded selected fields                                     |       200 |
| Selected depth                                               |        12 |
| Root record selections, including repeated aliases/fragments |         5 |
| Selected list length                                         |     1,000 |
| Stored-value traversal units per request                     |    10,000 |
| Opaque JSON nesting                                          |        64 |
| Serialized GraphQL response                                  |   256 KiB |
| HTTP execution deadline, including schema resolution         | 5 seconds |

Only one query operation is accepted. Batches, introspection (`__schema`, `__type`), mutations and subscriptions are rejected; `__typename` supports union fragments. Fragment expansion is bounded before record storage reads, including repeated and cyclic fragments. Selected lists and opaque regions fail explicitly rather than truncate. Yoga parse/validation caching is disabled so unique client documents cannot create an additional unbounded cache. Unexpected resolver failures are masked.

Request/response byte overruns return HTTP 413 with `QUERY_LIMIT`; validation failures return 400. Stored-field limits and historical mismatches can appear alongside partial data at HTTP 200. Authentication and route authorization use 401/403; disabled/unavailable configuration uses 503. The five-second deadline bounds the HTTP wait and prevents late record results from traversing metadata. Existing storage providers do not offer cancellable `getMeta`, so an already-started provider operation may finish after a timeout.

## Validation

Run the production service/renderer/registration tests and strict source/test type checking with:

```sh
npm --prefix packages/redbox-core run test:record-graphql
```

The core compiler, contributor registry, route/OpenAPI, raw-response, policy and loader regression suites also exercise the shared changes. The portal integration suite lifts the actual portal through Docker, uses persisted forms and Mongo records, issues real bearer tokens through `UsersService`, evaluates real path rules and record permissions, and exercises the registered controller over HTTP:

```sh
npm run compile:sails
npm --prefix packages/redbox-core run build
COMPOSE_PROJECT_NAME=redbox-graphql-record-metadata \
RBPORTAL_MOCHA_TEST_PATHS=test/integration/services/RecordGraphqlService.test.ts \
npm run test:mocha:mount
```

The checked-in publication draft, queued and published forms are title-only stubs. The richer nested/repeatable/reusable/conditional/hook cases are explicitly synthetic compiler fixtures, not institution forms or sampled production records. The original prototype's response-size comparison remains fixture evidence; it is not a production latency benchmark.

Validation completed on 2026-10-08 in `feature/graphql-record-metadata`, based on `81c6429ada820afa82663c1f1cfaab696ad6d19d`:

- **33 production GraphQL tests passed**, including strict source/test type checking, real record/role service permission decisions, bounded cache eviction/coalescing, timeouts, serialized response limits and private SDL round trips.
- **140 shared regression tests passed** across the compiler, contributor registry, raw-response contracts, route/OpenAPI contracts, validation/authentication policies and loader.
- **10 portal HTTP integration tests passed** with the actual Sails lift, persisted configuration, Mongo records, real bearer tokens, real policies and runtime service override checks. The Docker test project was isolated and removed after the run.
- Core and portal TypeScript builds passed. Oxlint and Prettier passed for the new implementation/tests/documentation, and `git diff --check` was clean.

All 15 original investigation source/document/evidence files were copied to the worktree without prototype dependencies. The original checkout retains those files. The original evidence JSON and prototype SDL describe the investigation renderer; production uses full UTF-16LE identity hashes and a stricter read-contract lifecycle, so they are not production schema snapshots.

### Rebase validation (2026-11-10)

Rebased the implementation onto `origin/develop` at `5151e3c33`. Conflict resolution retains upstream dependency versions and the updated logging/response types while adding GraphQL's pinned dependencies and response media type.

The core build, strict GraphQL test type-check, **33 GraphQL tests**, and **159 shared regression tests** passed on this base. GraphQL implementation lint and formatting checks also passed. The portal HTTP integration results above belong to the original implementation validation; that Docker suite was not rerun for this rebase.

### Review round 1 corrections (2026-11-10)

The first independent Codex Hub review identified four issues: field-free cyclic fragments could expand without consuming a bound; read contracts rejected legitimate edit/view duplicates; role-specific shapes retained only the first variant; and historical list-item errors discarded valid siblings. The fixes count all selection traversal steps and stop cycles, merge compatible read variants while keeping write compilation unchanged, use opaque nodes for incompatible variants, and complete list items independently. Regression coverage includes the checked-in related URL reusable definition, nested and repeatable role variants, indexed scalar/object/nested-list failures, and adversarial fragment graphs in an externally timed worker. Strict GraphQL type-check and all **41 GraphQL tests passed** after these fixes.

## Grid extension validation — 2026-11-11

The collection/catalogue extension passed **72 GraphQL tests** (including strict GraphQL source/test type-check), **223 targeted Solr/compiler/JSON Schema/route/policy regressions**, the record-schema test type-check, the core build, scoped Oxlint (zero warnings/errors), Prettier and `git diff --check`.

The standard Docker mount harness passed **18 HTTP integration tests**, combining `test/integration/services/RecordGraphqlService.test.ts` and `test/integration/services/RecordGraphqlGrid.test.ts`. These use real Sails controller/policies, persisted bearer credentials/path rules, MongoDB record authorization and Solr schema/index/cursor queries. Coverage includes equal-value sorting, inaccessible intervening hits, exact/contains/IN/numeric/date/boolean/missing filters, executable catalogue selections, route denials, invalid requests and disabled behavior. Grid scalar additions to publication forms are synthetic; the original checked-in publication forms remain title-only stubs.

The local dependency tree needed repair of existing pinned ReDoc peer and asset dependencies before the HTTP harness could run. No dependency manifests or lockfiles were changed for this extension. One discarded run overlapped a clean core build and could not load its temporarily absent compiled entry point; the successful run used a completed, stable build. No HTTP authorization or search layers were skipped in the successful run.

The grid contract intentionally requires a shared cursor secret, protected index fields plus reindexing, and explicit verified metadata index mappings. Fields available in only some scoped variants remain columns but require narrower workflow scope for filtering/sorting. Metadata-index queries recheck the current stored form's registered read shape before page boundaries. Candidate scans are capped at 200 and fail rather than returning misleading pages. See the wiki contract for freshness, non-snapshot cursors, missing values, resource limits and saved-grid examples.
