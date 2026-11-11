This document details the configuration and usage of named queries within our application's reporting framework. Named queries allow for the creation of predefined, parameterizable queries that can be utilized both within the application and via a REST API to fetch data in a structured and efficient manner.

## Overview

Named queries are stored per brand and managed through **Admin → Named Queries** (`/:branding/:portal/admin/named-query`). Core and hook bootstrap definitions can supply initial queries. Existing configuration shapes and REST clients remain supported. The examples below describe the execution configuration; the editor also supplies advisory field guidance.

## Configuration

Below is a breakdown of how to configure a named query within the `module.exports.namedQuery` object:

### Structure of a Named Query

Each named query is a property of the `namedQuery` object, identified by a unique key. For instance, `listRDMPRecords` and `listDRRecords` are examples of named query keys. Each key contains several sub-properties that define the query behavior:

- **collectionName**: Specifies the MongoDB collection to be queried. Supported values include `record`, `user`, and any other Sails-registered model name.
- **brandIdFieldPath**: Path within the documents to identify brand Id field. For records this is `metaMetadata.brandId`
- **resultObjectMapping**: Maps fields from MongoDB documents to the properties of the resulting JavaScript object. Use Handlebars templates for dynamic values, or plain dot paths for direct value lookup.
- **mongoQuery**: Contains the MongoDB query to filter documents in the collection. It specifies the criteria that documents must meet to be included in the result set.
- **queryParams**: Defines the parameters that can be passed to the query and how they alter the MongoDB query.

### Example: Configuring `listRDMPRecords`

Here's a closer look at the configuration of the `listRDMPRecords` named query:

```javascript
'listRDMPRecords': {
  collectionName: 'record',
  brandIdFieldPath: 'metaMetadata.brandId',
  resultObjectMapping: {
    oid: '{{record.redboxOid}}',
    title: '{{record.metadata.title}}',
    contributor_ci: '{{record.metadata.contributor_ci.text_full_name}}',
    contributor_data_manager: '{{record.metadata.contributor_data_manager.text_full_name}}'
  },
  mongoQuery: {
    'metaMetadata.type': 'rdmp',
    'metadata.title': null,
    'dateCreated': null
  },
  queryParams: {
    'title': {
      type: 'string',
      path: 'metadata.title',
      queryType: 'contains',
      whenUndefined: 'defaultValue',
      defaultValue: ''
    },
    'dateCreatedBefore': {
      type: 'string',
      path: 'dateCreated',
      queryType: '<=',
      whenUndefined: 'defaultValue',
      defaultValue: '3000-01-01T00:00:00.000Z'
    },
    // Additional parameters...
  }
}
```

### Parameter Configuration

Each parameter within `queryParams` consists of several sub-properties:

- **type**: The data type of the parameter (e.g., `string`, `number`).
- **path**: The document path that the parameter pertains to.
- **queryType**: Defines the type of comparison. Supported values are the [supported query modifier values](https://sailsjs.com/documentation/concepts/models-and-orm/query-language#?criteria-modifiers) in Sails (e.g., `contains`, `<=`).
- **whenUndefined**: Specifies the behavior if the parameter is not provided (e.g., `ignore`, `defaultValue`).
- **defaultValue**: A default value used if the parameter is undefined and `whenUndefined` is set to `defaultValue`.

### Template Syntax

Named queries support Handlebars templates and plain dot-path lookups. Legacy lodash templates (`<% ... %>` and `<%= ... %>`) are not supported because they execute unsandboxed JavaScript.

Common migrations:

| Legacy lodash template | Handlebars replacement |
|---|---|
| `<%= record.metadata.title %>` | `{{record.metadata.title}}` |
| `<%= _.toLower(value) %>` | `{{toLower value}}` |
| `<%= _.get(record, "metadata.title", "") %>` | `{{get record "metadata.title"}}` |

## Utilizing Named Queries via REST API

To utilize these named queries through the [REST API](https://redbox-mint.github.io/redbox-portal/additional-documentation/rest-api.html#report-report-get), send a request to the appropriate endpoint with the required parameters. For example, to call the `listRDMPRecords` query:

```
GET /default/rdmp/api/report/namedQuery/listRDMPRecords?title=someTitle&dateCreatedBefore=2022-05-01
```

The server will process this request by substituting the parameters into the named query configuration and executing the resulting MongoDB query.

## Schema-assisted editor

Open a query or choose **Create** to enter the full-page workspace. Select a
record collection, then a record type and optional workflow stage in **Fields
and help**. Search by label or path, or use the keyboard autocomplete in a path
input. Suggestions work in predicates, parameters, sort fields and mappings.
Raw JSON remains available for complex operators; unsupported expressions are
preserved. Save, Cancel and navigation protect unsaved work.

Guidance is advisory. Selecting a type/stage changes suggestions and warnings;
it never changes the query. **Add type constraint** explicitly adds a predicate.
A stage describes known fields at that stage, not every historical result.
Partial/form-derived or unavailable contracts leave manual editing enabled.
Namespaced client hook fields and custom mappings remain editable even when
absent from the contract. Non-record collections do not receive a record tree.
Related filters have their own foreign collection guidance.

### Paths and result context

| Location | Title example |
|---|---|
| Record schema (metadata relative) | `title` |
| Mongo predicate, parameter path, sort | `metadata.title` |
| Direct result mapping | `record.metadata.title` |
| Handlebars mapping | `{{record.metadata.title}}` |
| Report column for mapping alias `projectTitle` | `metadata.projectTitle` |

A named-query mapping receives `{ record: storedRecord }`. Mapped values are
wrapped under `metadata` in results. Envelope result fields such as `oid`,
`title`, `dateCreated` and `lastSaveDate` remain at the root. Direct lookups can
retain known source types; rendered templates generally produce strings.
Literal keys with dots or punctuation require lookup bracket syntax; the field
picker inserts it. Do not interpret `record` here as the email template context.

Parameter test inputs use parameter **names**, not paths. For example,
`createdAfter` can target `dateCreated` with a comparison operator. ISO timestamps
pass through; operator-bearing date parameters with `format: days` expect day
offsets. Defaults and explicit parameter templates retain their runtime order:
default, template rendering, type conversion.

### Validation and real-data preview

**Preview** explicitly executes the unsaved draft with the entered test values;
validation alone does not execute or save. Samples contain real data. Unknown
fields/types and template reference advice are nonblocking for saves; invalid
syntax, unsafe templates and unsupported execution paths can refuse preview.
Draft preview requires native `record` execution. User/custom collections,
related-filter reads and relation expansion remain editable/savable, but draft
preview refuses them with `PREVIEW_DEADLINE_UNSUPPORTED`.

Server limits are 128 KiB submitted JSON, depth 24, 4,000 visited nodes, 1,024
mapping aliases, 100 sample rows, 512 KiB serialized response, 1,000 scanned
rows and a 5-second query/render budget. Template expressions are limited to
256 per template. Clients cannot raise these limits. Inspect `truncated` and
`truncationReasons` (`rows`, `bytes`); a successful sample need not include every
match. Mongo count/find receive remaining `maxTimeMS`. Timeout is HTTP 408,
input/complexity overflow 413, denied access 403 and missing saved query 404.
Unexpected failures return safe error codes without database/parser details.

### Editor API

All routes below are relative to `/:branding/:portal/api/named-query` and use
current brand path permissions (Admin by default), authenticated caller context
and no-store responses. POSTs require a session CSRF token even when a bearer
token is also supplied. Session-backed create/update/delete also require CSRF;
sessionless bearer CRUD remains supported subject to the create permission and breaking-update review requirements below.

| Method | Suffix | Body / query |
|---|---|---|
| GET | `/editor/schema-targets` | Caller-authorized type/stage choices |
| GET | `/editor/fields` | `collectionName`, optional `recordType`, `stage` |
| POST | `/editor/validate` | `{ definition, guidance? }` |
| POST | `/editor/describe` | `{ definition, guidance? }` |
| POST | `/editor/preview` | `{ definition, guidance?, parameters? }` |
| GET | `/:name/description` | Brand-effective saved query; optional guidance |

Guidance is ephemeral editor state, never execution configuration. Completed
validation and structured preview refusals return HTTP 200 with `valid: false`
and diagnostics. API v1 returns DTOs directly; v2 (`X-ReDBox-Api-Version: 2.0`)
wraps them in `data`/`meta`. See [Configuring Reports](Configuring-Reports) for
report-owned description access and display/CSV contexts.

## GraphQL source

Choose **GraphQL** in the editor to store a read-only operation instead of a database
query. A missing `source` still means database; existing definitions are not migrated.
Unknown sources and mixed database/GraphQL fields are rejected. Switching sources
keeps separate unsaved buffers. A save publishes immediately; there is no publication
lifecycle. Validation checks schema, variables and mappings without executing records.
Preview explicitly reads real caller-authorized data.

GraphQL definitions have this shape (select metadata fragments from current schema
assistance when adding labels):

```javascript
{
  source: 'graphql',
  graphql: {
    document: `query Plans($type: String!, $first: Int, $after: String) {
      records(recordType: $type, first: $first, after: $after) {
        nodes { oid workflowStep }
        hasNextPage endCursor
      }
    }`,
    operationName: 'Plans',
    variables: {
      type: { ownership: 'fixed', value: 'rdmp' },
      first: { ownership: 'omitted' },
      after: { ownership: 'omitted' }
    },
    resultPath: ['records', 'nodes'],
    mappings: { oid: ['oid'], title: ['workflowStep'] }
  }
}
```

This is a nonlookup definition. A GraphQL named query is executable only through
supported authenticated consumers with trusted brand, portal and user context;
server calls without context fail closed (`GRAPHQL_CONTEXT_REQUIRED`). It invokes
the local RecordGraphqlService, never a remote endpoint, service-account fallback or
impersonated caller. Record/workflow/field permissions and all existing execution
bounds apply. Anonymous execution, mutations and subscriptions are unsupported.

### Variables and mapping

Classify each operation variable explicitly as `fixed`, `consumer` or `omitted`.
Fixed bindings contain a JSON `value`; omitted bindings leave the variable absent so
GraphQL operation defaults can apply. Consumer bindings contain `parameter`, GraphQL
`inputType`, `required` and optional `defaultValue`. Consumer inputs support scalars,
enums and lists of them; nested input objects are allowed only as schema-validated
fixed values. Numeric and boolean strings undergo strict schema-aware conversion.
Ambiguous values and unknown parameters fail validation.

A named-query consumer default applies only when the parameter is absent. Explicit
null, false, zero and empty text remain distinct. Without a named-query default an
absent optional variable is omitted, allowing its GraphQL default. Required values
must satisfy the declared GraphQL type and consumer contract.

Paths are arrays of literal property segments. `resultPath` starts at GraphQL `data`
and must resolve to an array; mapping paths start at each item. Aliases are response
keys, punctuation is literal, and only own properties are traversed. Prototype-related
segments, templates, automatic flattening and arbitrary expression evaluation are
unsupported. `metadata` maps an object; envelope mappings include `oid`, `title`,
`dateCreated` and `lastSaveDate`. Missing/null/invalid identifiers or labels cannot
be used for a lookup. Partial/error responses are failures, not empty suggestions.
A valid nonlookup definition may be saved even when it cannot serve a typeahead.

### First-page form lookups

Keep the existing vocabulary alias (`querySource: 'database'` with
`databaseQuery.queryName` pointing to the named query); this adapter dispatches by
the saved definition's source. Configure the form with `sourceType: 'namedQuery'`
and the alias as `queryId`. A complete vocabulary alias is:

```javascript
projectPrefix: {
  querySource: 'database',
  databaseQuery: { queryName: 'projectPrefix' },
  queryField: { type: 'text', property: 'search' }
}
```

`queryField.property` must equal `graphql.lookup.searchParameter`, its type must be
`text`, and the alias must not define `resultObjectMapping`. The form's `labelField`
and `valueField` must be `title` and `oid` respectively (or left at those defaults).
GraphQL lookup compatibility requires consumer-bound
search, scalar identifier/label mappings and explicit page metadata:

```javascript
lookup: {
  mode: 'firstPage',
  collectionPath: ['records'],
  hasNextPagePath: ['records', 'hasNextPage'],
  endCursorPath: ['records', 'endCursor'],
  firstVariable: 'first',
  afterVariable: 'after',
  searchParameter: 'search'
}
```

Put this object inside `graphql`. Declare `$first: Int` and `$after: String` in the
operation, use them directly for the selected records page, and leave them out of
`variables`: they belong exclusively to the server. Bind the operation's search
variable as consumer input, for example
`{ ownership: 'consumer', parameter: 'search', inputType: 'String!', required: true }`.
Use current schema selections and a filter such as
`{field: "metadata:/dc:identifier", iprefix: $search}` only after the
[explicit prefix index prerequisite](Record-GraphQL-Grids#literal-prefix-with-ascii-case-folding).

Only the first page is exposed, at most 25 suggestions, with `summary.numFound: null`,
`start: 0`, `page: 1`, and `pagination: { mode: 'firstPage', hasNextPage }`.
No offset or load-more emulation is provided. The form retains its configured minimum
characters/debounce, suppresses empty named-query searches and stale responses, avoids
caching GraphQL results, and displays a refine-search hint only when continuation is
proved. Database lookups retain their configured limits and legacy adapter behavior.
Lookup compatibility diagnostics belong to configuration verification, not record-save
validation. Offline tooling warns when runtime inspection is unavailable; genuine
inspected incompatibility remains fatal in verify mode.

### Explorer promotion and update review

**Create named query** snapshots the current unsaved visual or GraphQL exploration
into a detached editor. Visual mode uses fresh discovery and shared filter validation;
raw mode copies the current document and candidate variables without executing it.
Candidate values are neither fixed values nor defaults until explicitly classified.
Saving requires a unique valid name and separate named-query CREATE permission.
Cancel/failure leaves the exploration's identity, revision, URL, saved content and
unsaved edits intact. Provenance is informational; execution never follows it.
Preparation is session-only and CSRF-protected, including when a bearer token is sent.

Breaking source, parameter/default/type/nullability or lookup mapping changes require
`POST /:name/review-update` with the proposed definition, then PUT with
`X-ReDBox-Named-Query-Confirmation`. The signed acknowledgement expires after ten
minutes and binds the exact draft, saved state, actor/scope and known usages. A changed
draft, concurrent write or stale acknowledgement requires another review (409).
Known usages cannot enumerate dynamic hook/API callers.

Additional editor routes: `GET /editor/graphql-schema`,
`POST /editor/from-explorer`, `POST /:name/review-update`. All use no-store responses.
Disabled execution returns `GRAPHQL_DISABLED`/503; service unavailability can return
`UNAVAILABLE`/503 and timeouts 503. Other validation/bound failures retain safe codes;
engine messages and document values are not echoed.

### Deployment and rollback

1. Deploy above the current GraphQL and explorer layers. Build shared contracts before
   core, then affected form, named-query-editor and data-grids Angular applications.
   Package the matching assets and loader-generated shims together; no new hook service
   registration is required. Hook definitions still use normal config registration.
2. Review persisted path rules. Named-query POST now requires an applicable
   `/:branding/:portal/api/named-query` write (`can_update`) rule for session **and
   bearer** callers, in addition to feature access. Missing rules fail closed.
   Legacy update/delete still use their existing read-access check; this layer does
   not provide a general CRUD permission redesign. Audit those roles separately.
3. Session mutations require CSRF. Sessionless bearer CRUD remains supported, but a
   breaking bearer PUT must obtain the review acknowledgement described above (409
   otherwise). The review POST requires a CSRF session cookie and token: automation
   must retain the cookie jar from `GET /csrfToken` and send its token, even when bearer
   authentication supplies identity. Purely cookieless breaking updates are unsupported. Preparation is never enabled by bearer authentication alone.
4. Configure/reconcile/backfill any prefix companion before enabling its form alias.
   Verify real mixed-case, literal-prefix and ordinary-user ACL behavior. Schema
   presence and grid version markers do not certify completed reindexing.
5. Back up definitions before rollout. To revert the application, first remove or
   disable GraphQL form aliases and consumers, then archive/disable new GraphQL
   definitions. Older applications must not execute persisted GraphQL definitions as
   database queries. Do not mass-convert them. Revert runtime mounts/config and matched
   assets together; unused versioned companion fields may remain safely in Solr.

GraphQL reports, numbered-page/unknown-total report UI, CSV/export, exact totals and
broad performance work remain deferred. Report/CSV follow-up must establish trusted
caller propagation, bounded cursor traversal, unknown-total UI and explicit consistency
decisions; first-page suggestions are not an export interface.

GraphQL bootstrap definitions that fail validation or cannot inspect an available schema
are logged using safe codes and skipped. Check bootstrap logs before enabling a
dependent form alias; unchecked definitions are not silently imported.
