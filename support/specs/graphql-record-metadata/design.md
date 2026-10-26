# GraphQL record metadata investigation

Status: investigation implemented and validated locally, 8 October 2026.

## Recommendation

Add optional metadata projection to REST first for external integration reads. It provides the same selected stored values and essentially the same payload reduction as the GraphQL prototype, with fewer client and server concepts to maintain. Neither prototype reduces record storage reads: both authorize and load the whole record before selecting metadata.

Automatic workflow-specific GraphQL output types are feasible. If integrations need generated query types and fragment validation strongly enough to justify a second API, render GraphQL from the shared `ContractNode` tree. The tested JSON Schema conversion preserves the same typed-field coverage, but adds reconstruction of renderer-specific references and lifted conditions without improving the output.

This directory contains executable prototypes, tests, generated [SDL](schema.graphql), and deterministic [measurements](evidence.json). It installs no portal routes and changes no existing REST responses, production dependencies, storage models, or UI. Mutations, subscriptions, public discovery, UI migration, relationship traversal, and record listing are outside the investigation.

## Existing infrastructure and the read boundary

The [compiler](../../../packages/redbox-core/src/record-contract/record-contract-compiler.ts) produces dialect-neutral `RecordContract` data from effective forms and registered contributors. Its [nodes](../../../packages/redbox-core/src/record-contract/types.ts) already describe scalar, object, array, permissive, and conditional shapes, local definitions, annotations, ownership, and partial coverage. The [JSON Schema renderer](../../../packages/redbox-core/src/record-contract/json-schema-renderer.ts) consumes that tree. Hook authors contribute nodes rather than schema fragments; see the [contributor contract](../../wiki/Record-Schema-Contract-Contributors.md).

The existing schema API is a **write** contract. `RecordSchemaService.resolveUpdate` requires edit access, and `FormsService.buildContractFormConfig` builds submittable effective fields. Routing a viewer through that resolver would deny legitimate read-only integration users and could confuse UI/write constraints with metadata read permissions. This prototype instead compiles configured forms directly and performs the REST read authorization separately. It does not create an immutable write-schema grant or use its ETag as a read-schema identity.

The REST [metadata controller](../../../packages/redbox-core/src/controllers/webservice/RecordController.ts) loads the record, compares `metaMetadata.brandId` with the active brand, then calls `RecordsService.hasViewAccess`. The [prototype adapter](prototype/access.ts) follows that sequence and invokes the existing service implementation. Reader usernames, editor usernames, and matching brand roles retain their existing permission behavior. Form visibility and edit-only constraints do not become new read permissions: baseline REST returns authorized stored metadata regardless of those UI constraints.

## Implemented prototype

| File                                                     | Responsibility                                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [renderer.ts](prototype/renderer.ts)                     | Shared-tree output shapes, restricted JSON Schema conversion, name mapping, nullable GraphQL fields, strict historical-value checks, and coverage inventory |
| [graphql.ts](prototype/graphql.ts)                       | Yoga, `record(oid: ID!)`, metadata union, exact stored-context resolution, request-local record memoization, and query budgets                              |
| [sails.ts](prototype/sails.ts)                           | Explicit opt-in Sails configuration and actions for GraphQL and REST projection                                                                             |
| [projection.ts](prototype/projection.ts)                 | Optional metadata-only selectors, including nested objects and repeatable rows                                                                              |
| [fixtures.ts](prototype/fixtures.ts)                     | Real form compilation plus clearly identified synthetic fixtures and hook contributors                                                                      |
| [investigation.test.ts](prototype/investigation.test.ts) | Rendering, values, authorization, aliases, limits, and configuration tests                                                                                  |
| [sails.test.ts](prototype/sails.test.ts)                 | HTTP dispatch through a temporary Sails application and the existing record policy chain                                                                    |
| [evidence.ts](prototype/evidence.ts)                     | Repeatable payload, coverage, and storage-call measurements; SDL generation                                                                                 |

Dependencies are isolated in this directory and pinned to `graphql` **16.14.2** and `graphql-yoga` **5.24.2**, with an npm lockfile. The repository's existing TypeScript, ts-node, Sails, and test fixtures supply the development environment. Yoga supports Express integration and an HTTP request interface; the Sails action uses its fetch interface after Sails policies, rather than registering global middleware. See [Yoga's integration documentation](https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-express).

### Sails dispatch and authorization

The opt-in paths are:

```text
POST /:branding/:portal/api/graphql
GET  /:branding/:portal/api/record-metadata-projection/:oid?fields=...
```

`prototypeConfig` copies the existing `webservice/RecordController` wildcard policy chain, including `noCache`, `brandingAndPortal`, `checkBrandingValid`, `isWebServiceAuthenticated`, and `checkAuth`. Yoga parsing follows policy dispatch. These experimental actions have their own parameter checks; the REST route-contract validation policy is not an appropriate GraphQL body validator.

The action takes branding and portal only from policy-populated request locals and the caller from the authenticated request. It resolves the brand with `BrandingService.getBrand`; there is no brand argument in `record`. A missing authenticated caller is rejected before a storage read. New deployed paths must have the intended REST-equivalent path rules, since `checkAuth` permits paths without configured rules; copying the policy chain alone does not establish route authorization.

For each authorized record, its stored type, workflow stage, and form select the metadata member using `(brand, portal, recordType, workflowStep, form)`. The client cannot override them. A cross-brand or missing record has `RECORD_NOT_FOUND`; a same-brand record without read permission has `RECORD_FORBIDDEN`, consistent with REST's 404/403 distinction. GraphQL execution represents those failures as a nullable `record` plus a safe error, rather than copying the REST body/status envelope.

Sails has already consumed the incoming JSON body. The controller passes that parsed body to a reconstructed Yoga request, avoiding a second read of the drained HTTP stream. It returns raw GraphQL JSON without a REST `sendResp` envelope, which would invalidate the GraphQL response shape. Both experimental actions set `Cache-Control: private, no-store` and vary on Authorization and Cookie.

The temporary HTTP harness uses the actual Sails router and policy dispatch, actual branding/authentication/checkAuth/noCache functions, and actual `RecordsService.hasViewAccess`. Passport's credential decision, brand/path-rule lookups, and record storage are fixtures. Language, menus, and CSP policies are pass-through fixtures; this is not a full portal/Mongo/OIDC integration test.

### Workflow types and client examples

Each type name contains readable record-type/workflow names and a deterministic context suffix. Form identity, brand, and portal participate in that suffix; changes to fields within the same context retain the type name and change the SDL. The prototype rejects duplicate variants or type names. Nested object types derive from their metadata paths.

The checked-in forms produce these members:

```graphql
union RecordMetadata =
  | M_dataPublication_draft_fe0d67f3a72c
  | M_dataPublication_queued_491084ffbc12
  | M_dataPublication_published_6bf05cdb8de3
# The generated example SDL also includes the three rich fixture members.
```

An integration can select the common stored title across all three workflows:

```graphql
query PublicationRead($oid: ID!) {
  record(oid: $oid) {
    oid
    workflowStep
    form
    metadata {
      __typename
      ... on M_dataPublication_draft_fe0d67f3a72c {
        title
      }
      ... on M_dataPublication_queued_491084ffbc12 {
        title
      }
      ... on M_dataPublication_published_6bf05cdb8de3 {
        title
      }
    }
  }
}
```

Object fields on a union require typed fragments; `__typename` identifies the result member. This follows the [GraphQL union specification](https://spec.graphql.org/September2025/#sec-Unions). A fragment covering only draft remains a valid query when the record becomes queued, but returns no draft-selected metadata fields. Clients need all relevant workflow members or must deliberately handle that result.

The richer draft fixture illustrates nested selection:

```graphql
query IntegrationRead($oid: ID!) {
  record(oid: $oid) {
    oid
    metadata {
      ... on M_dataPublication_draft_90497600e8a3 {
        title
        details {
          description
        }
        contributors {
          name
        }
        custom_hook_value {
          value
        }
      }
    }
  }
}
```

Example variables: `{"oid":"draft"}`. This fixture returns:

```json
{
  "data": {
    "record": {
      "oid": "draft",
      "metadata": {
        "title": "Stored historical value",
        "details": { "description": "Stored historical value" },
        "contributors": [{ "name": "Stored historical value" }, { "name": "Stored historical value" }],
        "custom_hook_value": { "value": "Stored historical value" }
      }
    }
  }
}
```

### GraphQL read semantics

| Contract shape or stored condition                   | Output decision                                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| String, number, boolean                              | Nullable String, Float, Boolean; strict stored-value types                                                                                                                                   |
| Integer                                              | Nullable `MetadataInteger`, accepting JSON safe integers beyond 32 bits; GraphQL's built-in Int has a signed 32-bit range ([specification](https://spec.graphql.org/September2025/#sec-Int)) |
| Object                                               | Nullable object with selectable declared children                                                                                                                                            |
| Repeatable/list                                      | Nullable list and nullable items; no pagination or truncation                                                                                                                                |
| Conditional compatible objects                       | Nullable union of their declared properties; read stored values without executing the write predicate                                                                                        |
| Incompatible conditional shapes                      | Explicit opaque `MetadataJSON`; no typed child selections                                                                                                                                    |
| Permissive `any`, unknown hook, or empty open object | Explicit opaque `MetadataJSON`; preserve values and report coverage limitations                                                                                                              |
| Missing/null stored field                            | Null; do not apply form defaults or non-null write assumptions                                                                                                                               |
| Historical enum/vocabulary member                    | Preserve as the underlying scalar instead of generating a restrictive enum                                                                                                                   |
| Wrong historical primitive/container type            | Null the selected field and emit `HISTORICAL_VALUE_TYPE`; preserve valid siblings and omit the raw value from the error                                                                      |
| Unconfigured historical or additional property       | Outside the typed surface; REST projection can still select it                                                                                                                               |

The last distinction matters: equality between the two renderers does **not** mean every historical metadata key is typed. JSON Schema's allowance for unknown properties cannot automatically supply names or types for undeclared stored values.

Legal GraphQL field names remain unchanged except names beginning `__` or the reserved mapping prefix `rb_`. Other names become `rb_` followed by the UTF-8 bytes in hexadecimal. Reserving and encoding `rb_` itself makes the mapping injective. Examples: `dc:title` → `rb_64633a7469746c65`, `dc/title` → `rb_64632f7469746c65`, `9start` → `rb_397374617274`. The original metadata pointer appears in the generated field description. Nothing rewrites persisted keys.

### REST projection comparison

The equivalent selected-value request is:

```http
GET /default/rdmp/api/record-metadata-projection/draft?fields=/title,/details/description,/contributors/name,/custom_hook_value/value
Authorization: Bearer <integration-token>
```

Its body is `{ "data": <selected metadata>, "meta": { "oid": "draft" } }`. The measured metadata equals the GraphQL fragment result exactly, using the same authorized record.

Projection uses comma-separated metadata paths with RFC 6901 token escaping (`~1` for `/`, `~0` for `~`). Arrays transparently apply the remaining path to every row, so `/contributors/name` selects each contributor's name. This is a field-selection grammar, not an ordinary JSON Pointer addressing one array index. Missing keys are omitted; null remains null; a malformed historical intermediate scalar becomes null. Selecting a parent includes its whole value, independent of selector order. Whole-field values preserve historical types. The prototype does not add commas-in-key escaping, wildcards, aliases, array-index selection, or slicing.

An absent `fields` parameter returns the full metadata unchanged. Empty, malformed, oversized, or excessive selectors return 400. Own-property checks and constructed output objects prevent selectors from reading inherited JavaScript properties. Paths start at metadata, so they cannot select record authorization, internal lifecycle state, or other envelope data.

A production REST change should add this optional parameter to the existing metadata route's request schema and OpenAPI, then project **after** its existing brand/read authorization. Keep API-version envelopes, revision metadata, ETag/discovery headers, and the no-`fields` branch exactly as they are today. Define how projection interacts with `include=relationships` separately; this investigation performs no relationship queries. The separate comparison endpoint deliberately does not reproduce all production concurrency/discovery headers.

### Bounds

GraphQL requests allow one read operation, at most 64 KiB of parsed parameters, 2,000 parser tokens, depth 12, 200 expanded selected fields, and five root `record` selections. Fragment references count on every use; directives cannot reduce the conservative bound. Invalid cyclic fragments are rejected by normal GraphQL validation. HTTP batching, mutations, subscription operations, GraphiQL, the landing page, and introspection selections are disabled.

Repeated aliases for the same OID share one authorized record promise within that request. Different requests re-read and reauthorize; denied results are not cached across callers. Up to five different OIDs can still cause five reads. Selected lists have at most 1,000 entries and a shared 10,000-unit stored-value traversal budget. The Sails response bridge rejects responses beyond 256 KiB. These are prototype limits, not newly established ReDBox API defaults.

REST accepts at most 50 selectors, depth 12, and a 16 KiB selector string. Nested projection uses the same 1,000-row and 10,000-unit traversal bounds; selecting a whole field does not traverse its children. Both endpoints impose the response-byte cap after serialization. They do not bound database document size, pre-policy body parsing, or storage latency. Production transport limits and timeouts would still be needed. Yoga's [production guidance](https://the-guild.dev/graphql/yoga-server/docs/prepare-for-production) discusses query protection and persisted operations; there is no persisted-operation registry in this prototype.

## Validation and findings

Run from the repository root, after the normal repository development dependencies are installed:

```sh
npm --prefix support/specs/graphql-record-metadata ci --ignore-scripts --strict-peer-deps --no-audit --no-fund
npm --prefix support/specs/graphql-record-metadata run typecheck
npm --prefix support/specs/graphql-record-metadata test
npm --prefix support/specs/graphql-record-metadata run evidence
```

Validation passed: **24 tests**, including five through a temporary local Sails HTTP server, plus strict TypeScript checking. `evidence` regenerates `evidence.json` and `schema.graphql` and asserts equal selected metadata values and equivalent coverage. The HTTP harness uses an ephemeral loopback port and removes its temporary application after testing.

### Coverage comparison

The actual `redbox-hook-dev` publication draft, queued, and published configurations call `createStubFormConfig` and each declare only `title`. They are not rich production publication forms. The additional `investigation-publication-*` forms reuse the existing [contract fixture](../../../packages/redbox-core/test/fixtures/record-contract.fixtures.ts), adding hook shapes, mapping edge cases, and workflow-specific fields. The evidence labels these synthetic cases explicitly.

| Form set                         | Tree paths | JSON Schema conversion paths | Typed scalar paths | Opaque regions |
| -------------------------------- | ---------: | ---------------------------: | -----------------: | -------------: |
| Checked-in publication draft     |          2 |                            2 |                  1 |              0 |
| Checked-in publication queued    |          2 |                            2 |                  1 |              0 |
| Checked-in publication published |          2 |                            2 |                  1 |              0 |
| Rich draft fixture               |         68 |                           68 |                 49 |              2 |
| Rich queued fixture              |         69 |                           69 |                 50 |              2 |
| Rich published fixture           |         69 |                           69 |                 50 |              2 |

Path counts include containers and repeatable item paths; they are not percentages of all persisted metadata. Both approaches produce identical output SDL for each form. The rich cases retain two opaque regions: `/access_questions/questiontree-outcome-info` and `/geographic_coverage/features/*/properties`. Their compiler completeness is already partial because the fixture's question-tree runtime condition is annotation-only; GraphQL rendering does not upgrade that claim. Registered hook fields are typed; removing the hook registrations adds explicit permissive nodes. A second record-type fixture also resolves to its own exact union member. A separate test covers recovery of lifted conditions inside repeatable rows.

The JSON Schema converter handles ReDBox's local `$defs` references, nullable type lists, null-only `anyOf` wrappers, and lifted `allOf`/`if`/`then`/`else` branches. It is intentionally not a general converter: mixed unions, `oneOf`, tuple items, pattern properties, or unsupported references remain opaque. The direct renderer already has the declared condition branches and contributors' node kinds, so it avoids that dialect coupling. Current field-coverage equality supports choosing the shared tree, within the tested vocabulary.

### Response size and record storage reads

Bodies below are compact UTF-8 JSON. The equivalent GraphQL selection includes OID and selected metadata; the REST envelope puts the same OID in `meta`. Numbers exclude headers, TLS, database latency, and schema/configuration storage reads. Each synthetic record contains an unselected 8 KiB repeated `x` field; gzip measurements expose the bias that field creates in raw-byte savings.

| Fixture              | Full REST bytes | Projected REST bytes | GraphQL bytes | Full/projected/GraphQL gzip bytes | Record reads for each |
| -------------------- | --------------: | -------------------: | ------------: | --------------------------------- | --------------------- |
| Checked-in draft     |           8,284 |                   67 |            82 | 124 / 82 / 90                     | 1 / 1 / 1             |
| Checked-in queued    |           8,285 |                   68 |            83 | 124 / 83 / 91                     | 1 / 1 / 1             |
| Checked-in published |           8,288 |                   71 |            86 | 127 / 86 / 93                     | 1 / 1 / 1             |
| Rich draft           |          11,080 |                  262 |           277 | 599 / 142 / 147                   | 1 / 1 / 1             |
| Rich queued          |          11,120 |                  263 |           278 | 604 / 143 / 148                   | 1 / 1 / 1             |
| Rich published       |          11,116 |                  266 |           281 | 604 / 145 / 150                   | 1 / 1 / 1             |

GraphQL adds 15 uncompressed bytes over projection in these equivalent examples. Both have substantial response savings versus sending all synthetic metadata; the compressed advantage is smaller. No result supports choosing GraphQL for lower database load. `RecordsService.getMeta` delegates to storage for the aggregate record; neither prototype pushes projections into Mongo. Preserving authorization data and record context would remain necessary for any later storage-level projection.

The rich draft REST selector is 71 bytes and its GraphQL query is 203 bytes before variables or HTTP framing. These are example request sizes, not a performance benchmark or a claim about mature generated clients.

### Behavior exercised

| Case                                                                      | Result                                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Publication draft/queued/published                                        | Exact workflow/form member; real stubs and rich fixtures queried                    |
| Nested, repeatable, reusable, conditional, hook fields                    | Both rendering paths retain equivalent types and paths                              |
| Missing stored metadata and retired vocabulary members                    | Nullable omissions and preserved historical scalar values                           |
| Wrong historical primitive type                                           | Safe partial GraphQL error; REST whole-field projection retains the original value  |
| Invalid/reserved names                                                    | Collision-free mapping and original stored keys preserved                           |
| Unregistered hook, incompatible conditional, unsupported schema           | Explicit JSON fallback, not claimed typed coverage                                  |
| Same-brand record denial                                                  | Existing service permission decision; no metadata returned                          |
| Missing/cross-brand record                                                | Private not-found outcome in both endpoints                                         |
| Username, editor, role access                                             | Existing read-permission behavior retained                                          |
| Repeated aliases                                                          | One read per OID per request; later requests reauthorize                            |
| Expanded/cyclic fragments, valid excessive depth, aliases, fields, tokens | Rejected before a storage read                                                      |
| Oversized variables, HTTP batch, discovery, mutation                      | Rejected before a storage read                                                      |
| Large selected list and aggregate traversal                               | Explicit budget errors, no silent truncation                                        |
| Oversized serialized response                                             | HTTP 413 through the Sails bridge for both prototypes                               |
| Form changes within one context                                           | Stable member name, changed SDL, removed selections rejected before reads           |
| Removed/unregistered stored form                                          | Record envelope remains readable; metadata is null with `UNRESOLVED_READ_CONTRACT`  |
| REST no selectors and nested selection                                    | Original full metadata preserved; projected values match GraphQL; input not mutated |

## Client and maintenance tradeoffs

| Concern                        | REST projection                                                   | Shared-tree GraphQL                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Immediate integration adoption | Existing GET client plus optional paths                           | Query document, workflow fragments, union handling, custom scalar mappings, and error handling                       |
| Typed queries                  | Dynamic selected JSON; existing schemas describe values           | Static selected-result tooling becomes possible from a private SDL artifact                                          |
| Historical/undeclared fields   | Direct stored-name access                                         | Typed surface covers declared nodes; opaque regions have no typed child selection                                    |
| Response/storage efficiency    | Selection after one authorized aggregate read                     | Selection after one authorized aggregate read                                                                        |
| Configuration evolution        | Paths can become absent without query validation failure          | Removed fields break validation; workflow changes can stop a fragment matching                                       |
| Server maintenance             | Extend route schema/OpenAPI; projection parsing and output checks | Second protocol; generator, name map, scalar semantics, union registry, schema publication, limits, and error policy |
| Contributor reuse              | No contributor needed to select raw stored fields                 | Existing node contributors reused; JSON Schema conversion adds unnecessary dialect maintenance                       |

Generated GraphQL types would help integrations that need validated query documents and generated result types across stable publication workflows. They do not remove configuration drift or guarantee historical type consistency. The prototype demonstrates that tradeoff, but does not install a client code generator or benchmark client development time.

If GraphQL is promoted later, introduce a read-contract resolver that preserves the existing REST read/redaction semantics, assemble schemas per authorized brand/portal rather than a globally discoverable catalog, cache by configuration/contributor identity, and atomically rebuild on configuration changes. Publish SDL privately to integration owners and check their registered queries before rollout. Do not fetch write-schema artifacts with edit authorization or reuse write-only field filtering. Keep the underlying contract compiler and hook registrations shared.

The local tests and fixture measurements support REST projection as the next implementation. A production rollout would still need real institution forms and anonymized historical records, portal authentication and hook-override integration tests, deployed path rules, and production size/latency measurements. These are rollout conditions, not unimplemented parts of this isolated investigation.
