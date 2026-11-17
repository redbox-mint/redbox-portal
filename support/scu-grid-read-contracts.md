# Explicit metadata reads: findings 3 and 6

> Historical read-contract verification. Later scalar-list work adds element filtering and min/max sorting on Mongo; statements below excluding list sorts describe the earlier implementation. See [Record GraphQL grids](wiki/Record-GraphQL-Grids.md#declared-scalar-lists) for current capabilities and saved-query repair requirements.

This note contains configuration keys and synthetic verification results only. Private audit inputs, copied hook sources and intermediate contracts remain under the ignored `.tmp/scu-grid/` directory or the private task-evidence directory. None belongs in a commit. External hook clones were read without changes.

## Reproduction before changes

Baseline: `224ed41ff`, using the supplied branding-scoped `configuration` documents and the actual `feature/v5-refactor` reusable definitions from `.tmp/scu-grid/hook22/src/config/reusableFormDefinitions.ts`. Only its core-package import was redirected to this worktree's core configuration module; the reusable definitions were not reconstructed. The bundle contains 13 runtime configuration documents; legacy duplicate form documents without `configuration` were excluded. These describe 16 workflow variants.

Commands run from the repository root:

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types -r ./packages/redbox-core/node_modules/ts-node/register/transpile-only .tmp/scu-grid/exact-baseline.ts
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types -r ./packages/redbox-core/node_modules/ts-node/register/transpile-only .tmp/scu-grid/probe-read.private.ts
```

Captured `exact-before.log`: all 16 variants compiled; publication catalogue 166 fields; Party, Activity, Funding and Jira catalogues each eight fields. All six publication contributor carriers and the classification outcome-details carrier compiled as STRING in all four publication stages. RDMP across all stages failed its catalogue fingerprint bound; total SDL was 333747 bytes. The parent owns those latter two issues.

The probe materialized synthetic values from the supplied shape samples, then used the actual GraphQL renderer. It retained object/list/null structure while replacing every source value. `exact-shape-before.log` reported eight `HISTORICAL_VALUE_TYPE` errors each for the supplied draft and queued v5 publication samples: six contributor carriers, outcome details, and the scalar question answer. This verifies the failure with supplied shapes, without claiming that synthetic values reproduce all production records.

## Generic implementation

`FormComponentDefinitionFrame.readShape` explicitly declares a persisted carrier's read type. Supported types are string, number, integer, boolean, declared object properties and arrays with a declared item shape. Labels are optional. Nodes are nullable for reads. The compiler rejects unknown options, raw JSON types, empty/open object declarations, malformed shapes, dangerous property names and configured depth/property/document bounds. Privacy exclusions from contributors are retained, including fail-closed exclusion when an override changes a private shape's topology. Unsupported or non-persisting components cannot silently accept a shape. Put reusable-field declarations on the effective field, not the reusable usage.

`FormConfigFrame.readMetadata[recordType]` explicitly declares metadata absent from a generated form. Exact type scoping matters because Activity, Funding and Jira share `generated-view-only`. It supports `properties`, an optional scalar `identity` property name and ordered scalar `defaultColumns` property names. No records are scanned to infer columns. Read declarations do not alter write contracts. Form bootstrap, construction and component view transformations preserve the authoring options.

The native question-tree DSL uses a RadioInput scalar when `answersMax === 1`, and a CheckboxInput list for multiple answers. The contributor now follows that rule. Visibility conditions do not turn stored scalar answers into arrays. Existing unsupported rule diagnostics remain; this change does not execute browser expressions on the server.

## Exact hook opt-in mapping

The core changes alone cannot know the intended shape of expression-populated hidden SimpleInputs. The hook must add these declarations to the effective publication definitions used by **all four** publication forms: draft, queued, published and retired. Keep the existing components, models, expressions, mode overrides and validators.

```ts
import type { MetadataReadShape } from '@researchdatabox/sails-ng-common';

const strings = (names: string[]): Record<string, MetadataReadShape> =>
  Object.fromEntries(names.map(name => [name, { type: 'string' }]));

// Explicit export allowlist. Additional directory fields remain unselectable.
const person: MetadataReadShape = {
  type: 'object',
  properties: strings([
    'name', 'email', 'text_full_name', 'username', 'role', 'orcid',
    'honorific', 'ID', 'given_name', 'family_name', 'full_name_honorific'
  ])
};
const people: MetadataReadShape = { type: 'array', items: person };

const publicationReadShapes: Record<string, MetadataReadShape> = {
  contributor_author: person,
  contributor_ci: person,
  contributors: people,
  contributors_data_manager: people,
  contributors_external: people,
  contributors_supervisor: people,
  'scu-data-publication-data-classification-item-outcome-details': {
    type: 'array',
    items: {
      type: 'object',
      properties: strings(['classification', 'metadataTag'])
    }
  }
};
// For each matching effective hidden field: field.readShape = publicationReadShapes[field.name].
```

The classification expression projects `questiontree-outcome-info.meta` to `{ classification, metadataTag }[]`; `metadataTag` is absent in one inspected shape and therefore reads null. Question-tree answer fields need no hook opt-in after the native contributor correction. The declaration is deliberately independent of browser expression evaluation.

For lookup reads, add the following exact type entries to `readMetadata` on `party-1.0-draft` and `generated-view-only`, respectively. Definitions may be centralized and copied when authoring those forms. Bootstrap/update the stored branding-scoped form configurations through the hook's normal deployment process; editing only a source registry does not prove existing stored forms changed.

```ts
const lookupReadMetadata = {
  party: {
    properties: strings([
      'text_full_name', 'fullName', 'given_name', 'family_name',
      'email', 'orcid', 'staff-number'
    ]),
    identity: 'text_full_name',
    defaultColumns: ['text_full_name', 'email', 'orcid']
  },
  activity: {
    properties: {
      ...strings(['title', 'irma-id', 'coversheet-id', 'status', 'description']),
      contributor_ci: person
    },
    identity: 'title',
    defaultColumns: ['title', 'irma-id', 'status']
  },
  funding: {
    properties: strings(['provider-id', 'provider-name']),
    identity: 'provider-name',
    defaultColumns: ['provider-name', 'provider-id']
  },
  'jira-ts': {
    properties: {
      ...strings(['workspaceTitle', 'jiraStatus', 'rdmpOid']),
      contributors: people
    },
    identity: 'workspaceTitle',
    defaultColumns: ['workspaceTitle', 'jiraStatus', 'rdmpOid']
  }
};
// party form: readMetadata = { party: lookupReadMetadata.party }
// generated-view-only: readMetadata = {
//   activity: lookupReadMetadata.activity,
//   funding: lookupReadMetadata.funding,
//   'jira-ts': lookupReadMetadata['jira-ts']
// }
```

These are explicit proposed export fields based on the supplied shapes, not permission to publish every directory field. Hook maintainers can narrow the allowlists further. Funding `authorization` and label-cache fields are not declared. No index filter/sort capability is inferred by these read declarations; the separate index-binding work owns that capability.

## UI integration

Field discovery adds optional `identity: Boolean` and `defaultColumn: Int`. Hints are returned only for selectable top-level scalar fields present in every selected workflow variant, and must agree across those variants. The UI should request both properties, order explicit default columns numerically, and use the declared identity field in place of a generic Title default. Existing defaults remain the fallback when no hints exist. Saved user-selected columns should retain their normal behavior. `identity` identifies a configured field; it does not synthesize a title or coalesce raw metadata values. No data-grids UI files were edited by this implementation delegate.

## Verification after changes

Private command scripts `exact-after.ts`, `probe-read.private.ts` and `lookup-probe.private.ts` compiled the same supplied forms with the explicit declarations above, using the same exact reusable definitions. `exact-shape-after.log` reports zero errors for each of the draft and queued synthetic publication probes. The lookup probe returned:

| Type | Catalogue fields | Explicit identity | Ordered default metadata | Errors |
| --- | ---: | --- | --- | ---: |
| Party | 15 | `/text_full_name` | text_full_name, email, orcid | 0 |
| Activity | 24 | `/title` | title, irma-id, status | 0 |
| Funding | 10 | `/provider-name` | provider-name, provider-id | 0 |
| Jira | 24 | `/workspaceTitle` | workspaceTitle, jiraStatus, rdmpOid | 0 |

Every synthetic identity returned a nonempty scalar. These counts describe the explicit opt-in experiment, not a deployed hook change.

The checked-in anonymized fixtures retain hidden expression carriers, a JSONata array projection, reusable expansion, a dependent question rule, mixed single/multiple question answers, absent optional values, extra undeclared storage fields and view transforms. They contain no original source values.

Local command (from `packages/redbox-core`):

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require test/setup.ts test/unit/record-graphql/read-authoring.test.ts
```

Result: nine new tests passing, including production construction and view-transform preservation. The final 39-test read-authoring/variant/privacy selection passed in a disposable `redbox-portal:ux-wp1-node24` Docker container run with `sudo -n docker`, `--rm`, `--network none`, read-only source/dependency mounts and the unique name `scu-grid-read-contract-tests`. Docker permission denial was resolved; no existing thread containers were touched.

The full combined `npm run test:record-graphql` initially stopped on concurrent sibling test TypeScript errors (business-index, scoped-schema and scu-catalogue); these were recorded in `.tmp/scu-grid/coordination.md`. An attempted broader compiler suite could not load the unrelated generated RAiD package: `packages/raido/dist/index.js` requires missing `./api`. After the concurrent test fixes landed, the complete `npm run test:record-graphql` passed TypeScript checking and finished with **169 passing, one pending**. The isolated Docker selection finished with **39 passing**. `npm --prefix packages/sails-ng-common run compile` and `git diff --check` also passed. Full Sails/Mongo integration and browser verification of installed hook opt-ins have not been performed by this delegate.

Parent integration restricts question-tree storage correction to `fieldMode: 'read'`; existing write-validation vocabulary and deterministic write-schema digests remain unchanged. The broader record-contract selection passes **92 tests**, including its original create/update snapshots. Catalogue presentation hints are applied before revision hashing; the UI requests them and uses declared default identities. Shared UI/persistence filter guards also accept verified scalar lists, while keeping object lists and list sorts unavailable.
