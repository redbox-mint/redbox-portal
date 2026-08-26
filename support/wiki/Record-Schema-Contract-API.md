# Record Schema Contract API

When record schema contracts are enabled, an authenticated API client can
resolve the caller-effective JSON Schema draft 2020-12 document for a create or
update, cache that exact document privately, validate metadata structure, and
use the update schema ETag as an optional write precondition. The schemas are
dynamic: the server resolves the current brand, portal, record type, workflow
step, form, operation, caller access, unknown-property policy, and validation
rollout mode before compiling a contract.

This page describes the client contract. For deployment configuration and
operations, see [Operating Record Schema Contracts](Record-Schema-Contract-Operations).

## Endpoints

All three endpoints require bearer authentication and retain the API's normal
route authorization. A deployment mounted beneath a root context prefixes the
paths below; server-provided URLs already include that prefix.

| Method and exact route | Semantics |
|---|---|
| `GET /:branding/:portal/api/records/schemas/create/:recordType` | Resolve the caller-effective schema for the raw metadata object submitted to create `recordType` |
| `GET /:branding/:portal/api/records/schemas/update/:oid` | Re-authorize access to `oid` and resolve the caller-effective schema for a raw partial metadata update; the document does not require every record property |
| `GET /:branding/:portal/api/records/schemas/:digest` | Retrieve the immutable artifact identified by a lowercase 64-character SHA-256 `digest`, after current equivalent authorization is re-evaluated from its grants |

The create and update resolvers accept the optional `operation` query
parameter. The immutable route does not accept an operation because its digest
already identifies one exact document.

### Operation query semantics

An operation name is trimmed, case-sensitive, at most 64 characters, and must
match `[A-Za-z][A-Za-z0-9._-]{0,63}`. For example, `submit` and `Submit` are
different names. A syntactically invalid value is HTTP 400. An unknown or
unauthorized name fails closed even when validation rollout is `shadow`.

Use the same operation on schema resolution and the corresponding record
write:

```text
GET /default/rdmp/api/records/schemas/update/record-123?operation=publish
PUT /default/rdmp/api/records/metadata/record-123?operation=publish
```

A named operation selects its exact server-owned validation policy and
effective form context. It is not a CRUD method, a workflow target, or a
client-controlled validation-group list. Client `enabledValidationGroups`
values cannot weaken it.

Omitting `operation` selects the compatibility `strict-all` context. The
document then contains `"operation": "strict-all"` in `x-redbox-context`, and
the later business-validation phase runs every blocking validator instead of a
browser-selected conditional subset. Omission is supported, but clients that
know their intended server operation should send it consistently.

## Successful schema responses

HTTP 200 is the raw JSON Schema document, not an API v1 or v2 `{ data, meta }`
envelope:

```http
Content-Type: application/schema+json
ETag: "sha256:<64-lowercase-hex>"
Cache-Control: private, no-cache
Vary: Authorization
Link: </default/rdmp/api/records/schemas/<digest>>; rel="canonical"; type="application/schema+json"
```

`Link` with `rel="canonical"` is present on create and update resolver
responses, including HTTP 304. It points to the immutable route. The immutable
route returns the same `ETag`, `Cache-Control`, and `Vary` headers but does not
repeat a canonical `Link` header.

Every published document contains these contract fields in addition to its
ordinary JSON Schema keywords:

| Field | Semantics |
|---|---|
| `$schema` | Exactly `https://json-schema.org/draft/2020-12/schema` |
| `$id` | Origin-relative immutable route `/:branding/:portal/api/records/schemas/:digest`, with route segments encoded |
| `type` | Root metadata value is an `object` |
| `x-redbox-contract-format` | Compiler/annotation contract version; currently `redbox-record-contract/1` |
| `x-redbox-context` | Public resolution fields: `brand`, `portal`, `kind`, `recordType`, `workflowStep`, `form`, `operation`, `unknownProperties`, and `enforcement` |
| `x-redbox-completeness` | `complete` or `partial` |
| `x-redbox-validation` | Safe business-validator summaries containing `code`, `pointers`, `groups`, `operations`, and `blocking`; these are annotations, not executable business rules |
| `x-redbox-diagnostics` | Ordered safe diagnostics containing `code`, `severity`, `message`, and, when applicable, `pointer`, `componentType`, and `contributor` |

The document never serializes the record OID, record values, caller, role set,
request ID, token, or raw validator expression/output.

### Partial contracts and diagnostics

A valid but incomplete contract is still HTTP 200. Clients must inspect
`x-redbox-completeness`, not infer completeness from the status code. A partial
document describes every represented region normally and leaves an
unrepresentable custom region permissive. For example, an uncovered hook
component is marked at its schema node:

```json
{
  "x-redbox-unsupported-component": "ExampleHookComponent"
}
```

The runtime currently reuses `x-redbox-unsupported-component` in two places:
as the schema-node annotation keyword and as the `code` value in the separate
root diagnostic. The annotation value names the unsupported component, while
the diagnostic identifies the limitation without exposing record content:

```json
{
  "code": "x-redbox-unsupported-component",
  "severity": "warning",
  "message": "A custom component has no registered record-contract contributor and remains permissive.",
  "pointer": "/custom_value",
  "componentType": "ExampleHookComponent"
}
```

A partial schema can validate the regions it represents, but a successful
client-side validation is not proof that an unrepresented region is valid.
Partial completeness is not itself a save warning: the server still validates
the represented structure and then runs its authoritative business validators.
Treat an `error` diagnostic or an unexpected unsupported component as a reason
to stop automated rollout and review the contract. Exceeding the configured
diagnostic limit does not return a truncated schema; it fails resolution with
HTTP 413 and `record-schema.limit-diagnostics`.

## Private caching and HTTP 304

All three GET routes accept one strong schema tag in `If-None-Match`:

```http
If-None-Match: "sha256:<64-lowercase-hex>"
```

Send the exact `ETag` previously returned for that schema. Weak tags,
wildcards, comma-separated lists, and repeated header values are invalid. The
request parser tolerates leading or trailing HTTP space or tab around one tag,
but the canonical value and OpenAPI pattern contain no surrounding whitespace.

The server authenticates and authorizes the request before deciding that it is
not modified. An authorized match returns HTTP 304 with no body and repeats:

```http
ETag: "sha256:<64-lowercase-hex>"
Cache-Control: private, no-cache
Vary: Authorization
```

Resolver 304 responses also repeat the canonical `Link`. `private, no-cache`
allows storage in a caller-private cache but requires revalidation before reuse;
it does not authorize a public or shared cache. `Vary: Authorization` is
therefore part of the representation contract. A missing and an inaccessible
immutable digest both return HTTP 404 rather than revealing cross-scope
existence, and neither can be converted into a 304 by a matching tag.

## Runtime discovery

Clients do not need to derive schema URLs from form names:

- `GET /:branding/:portal/api/recordtypes/get?name=:recordType` and
  `GET /:branding/:portal/api/recordtypes` add
  `recordSchemaCreateResolver` to each record type while the feature is
  enabled.
- Successful `POST /:branding/:portal/api/records/metadata/:recordType` and
  `PUT /:branding/:portal/api/records/metadata/:oid` responses add
  `Link: <.../api/records/schemas/:digest>; rel="describedby";
  type="application/schema+json"` without changing the API v1 or v2 body.
- An authorized `GET /:branding/:portal/api/records/metadata/:oid` adds the same
  `describedby` link when the current update contract can be resolved safely.
- The OpenAPI create and update record operations contain
  `x-redbox-record-schema-resolver`. It gives the resolver `routeTemplate`,
  `schemaKind`, `operationParameter`, `mediaType`, and exact ETag semantics.
  The update extension also names the optional write-precondition header and
  its HTTP 412 behavior.

`GET /:branding/:portal/api/forms/get` is **not** a record contract endpoint.
It returns UI form configuration and caller-authorized operation discovery;
its output is not JSON Schema, is not served as `application/schema+json`, has
no schema digest, and must not be used to precondition a record write. Use its
`validationOperations` only to choose an operation name, then resolve the
corresponding record schema endpoint.

## Conditional update writes

The schema precondition is optional on these record writes:

```text
PUT  /:branding/:portal/api/records/metadata/:oid
POST /:branding/:portal/api/records/workflow/step/:targetStep/:oid
```

Resolve the current update schema with the same `operation`, retain its strong
ETag, and send it as:

```http
X-ReDBox-Record-Schema-If-Match: "sha256:<64-lowercase-hex>"
```

This deliberately is not the standard `If-Match` header. `If-Match` carries
the record revision ETag documented in
[Concurrent Record Modifications](Concurrent-Record-Modifications). A client
may send both headers to require both the expected record revision and the
expected record schema.

After current access and authoritative context have been resolved, the server
compares `X-ReDBox-Record-Schema-If-Match` with the newly resolved
**full-document** schema digest. It performs that comparison before structural
delta validation, merge handling, hooks, business validation, or record
storage. A match permits processing to continue. Omitting the header preserves
the existing optimistic behavior. A malformed, weak, wildcard, or list value
is HTTP 400 with `record-schema.invalid-request`; repeated header values are
rejected at the HTTP request-contract boundary with HTTP 400.

A stale, well-formed tag is HTTP 412 with the normal record-save
`application/json` response, not `application/problem+json`. In API v2 the
diagnostic is:

```json
{
  "errors": [
    {
      "code": "record-schema.precondition-failed",
      "title": "@record-schema.precondition-failed"
    }
  ],
  "meta": {
    "outcome": "not-saved",
    "problems": [
      {
        "kind": "validation",
        "source": "schema",
        "phase": "schema",
        "issues": [
          {
            "code": "record-schema.precondition-failed",
            "message": "@record-schema.precondition-failed"
          }
        ]
      }
    ]
  }
}
```

The OpenAPI 412 response description is `Record revision or schema
precondition failed` and uses the normal record-save failure schema. Its
`ETag`, when present, is the record revision tag, not a replacement schema tag.
A failed write has no schema discovery `Link`. Re-resolve the update schema;
do not retry automatically under the stale tag.

## Structural and business validation are separate

The JSON Schema is the structural contract: JSON types, object properties,
required properties where applicable, enumerations, arrays, nullability, and
representable conditions. For updates it validates the untouched partial
metadata delta before merge or hooks. It does not replace ReDBox's existing
server validators, expressions, authorization, or workflow rules. Those
business validators run later against the authoritative candidate after merge
and pre-save hooks.

For example, suppose the update schema declares:

```json
{
  "properties": {
    "title": { "type": "string" }
  }
}
```

The delta `{ "title": 42 }` is structurally invalid and, in `enforce` mode,
returns HTTP 400 with `source: "schema"`, `phase: "schema"`, code
`record-schema.type`, pointer `/title`, and `expected: { "type": "string" }`.

The delta `{ "title": "" }` is schema-valid because the value is a string,
but it can still violate the existing `required` business validator. That
request returns HTTP 400 with `record-validation-failed`, `meta.outcome:
"not-saved"`, and a `phase: "pre-save"` business problem with no schema
`source`. A client must pass both layers; validating against the JSON Schema
does not predict every server-side business result.

## Problem Details from schema endpoints

Controller-dispatched schema validation, business, and storage failures are raw
RFC 9457-style Problem Details with `Content-Type: application/problem+json`;
they are not API envelopes. Each such body requires these six fields: `type`,
`title`, `status`, `detail`, `instance`, and `code`. `instance` is the
origin-relative request route for the occurrence. `code` is the stable ReDBox
record-schema code and may be a more specific code from the mapped service
failure.

Authentication and request-policy failures may be handled before controller
dispatch and retain the existing legacy HTTP 401 or 403 response instead of
this Problem Details shape. Depending on the policy path, that can be a
bodyless 403 or an `Access Denied` response. Clients must not assume that every
schema endpoint failure, or every 401 or 403 response, has the six fields above.

```json
{
  "type": "https://redboxresearchdata.com/problems/record-schema-not-resolvable",
  "title": "Record schema could not be resolved",
  "status": 409,
  "detail": "The record schema could not be resolved from the authoritative context.",
  "instance": "/default/rdmp/api/records/schemas/create/rdmp",
  "code": "record-schema.not-resolvable"
}
```

The OpenAPI contract declares the following statuses and controller Problem
Details defaults for each schema GET. The 401 and 403 rows apply when the
controller dispatches the response; pre-controller authentication and
request-policy responses are the legacy exceptions described above.

| Status | Default `type` and `code` | Exact default `title` and `detail` |
|---:|---|---|
| 400 | `https://redboxresearchdata.com/problems/record-schema-invalid-request`; `record-schema.invalid-request` | `Record schema request is invalid`; `The record schema request is malformed.` |
| 401 | `https://redboxresearchdata.com/problems/record-schema-authentication-required`; `record-schema.authentication-required` | `Authentication is required`; `Authentication is required to resolve a record schema.` |
| 403 | `https://redboxresearchdata.com/problems/record-schema-forbidden`; `record-schema.forbidden` | `Record schema request is not authorized`; `The record schema request is not authorized.` |
| 404 | `https://redboxresearchdata.com/problems/record-schema-not-found`; `record-schema.not-found` | `Record schema was not found`; `No accessible record schema or resolution context was found.` |
| 409 | `https://redboxresearchdata.com/problems/record-schema-not-resolvable`; `record-schema.not-resolvable` | `Record schema could not be resolved`; `The record schema could not be resolved from the authoritative context.` |
| 413 | `https://redboxresearchdata.com/problems/record-schema-limit-exceeded`; `record-schema.limit-exceeded` | `Record schema limit exceeded`; `The record schema exceeds configured complexity or output limits.` |
| 422 | `https://redboxresearchdata.com/problems/record-schema-invalid-contract`; `record-schema.invalid-contract` | `Record schema contract is invalid`; `The record schema contract is invalid.` |
| 503 | `https://redboxresearchdata.com/problems/record-schema-unavailable`; `record-schema.unavailable` | `Record schema is unavailable`; `The record schema capability is temporarily unavailable.` |

HTTP 400 covers malformed path, operation, digest, or conditional-header input.
HTTP 404 deliberately projects an inaccessible immutable artifact the same as
a missing one, even if the underlying authorization check failed. HTTP 409 is
an authoritative-context resolution failure; 413 is a configured complexity or
output limit; 422 is an invalid lazily encountered form/contributor contract;
and 503 covers the disabled feature or unavailable compiler, storage, or
required capability. A partial but valid document is 200, not 206 or 422. A
root resolution failure never returns an empty permissive schema.

## Whole-document identity

The lowercase digest and strong ETag identify the entire normalized public
document, not only keywords that happen to reject input. ReDBox removes the
protected root `$id`, normalizes compiler-owned unordered sets, serializes the
remaining document with ReDBox Canonical JSON v1, computes SHA-256 over those
UTF-8 bytes, then injects `$id` using the resulting digest. Excluding `$id`
avoids a circular hash; clients must not calculate identity by hashing the
published document including `$id`.

Whole-document identity is intentional. A changed `description`, default,
ordered example list, `x-redbox-diagnostics`, `x-redbox-completeness`, or
`x-redbox-context.enforcement` (`shadow` versus `enforce`) changes what a client
or auditor learns from the contract, so it changes the digest, immutable URL,
and ETag even when the same sample metadata still validates. Changes to the
effective form, operation, workflow step, unknown-property policy, contributor
annotations, or represented validation summaries can do the same.

Object-key order and compiler-owned set order do not cause churn because they
are normalized. Semantically ordered annotation data such as `examples`
retains its order and therefore remains identity-bearing. Never edit, merge, or
strip a fetched schema and continue to label it with the server's ETag.

## Recommended client sequence

1. Discover the create resolver from `recordSchemaCreateResolver` or
   `x-redbox-record-schema-resolver` in OpenAPI. A runtime `describedby` link
   instead discovers the immutable digest schema URL for that representation.
2. Resolve with bearer authentication and the intended `operation`.
3. Store the raw `application/schema+json` document and strong ETag only in a
   private cache; inspect completeness and diagnostics.
4. Revalidate with `If-None-Match` before reuse and retain the cached document
   only after an authorized 304.
5. Validate raw create metadata or the raw update delta structurally, while
   expecting later business validation to remain authoritative.
6. For an update, send the resolved schema ETag in
   `X-ReDBox-Record-Schema-If-Match` and, when record concurrency requires it,
   send the independent record revision `If-Match` too.
7. On HTTP 412, discard the stale schema decision, resolve the current update
   schema, review its whole-document changes, and prepare a new request.

## See also

- [ReDBox Portal API](ReDBox-Portal-API)
- [REST API Documentation](REST-API-Documentation)
- [Generated Reference Documentation](Generated-Reference-Documentation)
- [Operating Authoritative Server-Side Form Validation](Server-Side-Form-Validation-Operations)
- [Concurrent Record Modifications](Concurrent-Record-Modifications)
