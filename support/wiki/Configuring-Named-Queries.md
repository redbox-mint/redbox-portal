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
existing sessionless bearer CRUD clients retain their behavior.

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
