# Record Schema Contract Contributors

Record-contract contributors let an installable ReDBox hook describe the
persisted shape of its custom form components. Contributors extend the dialect-neutral internal
record contract; ReDBox alone renders that contract as JSON Schema draft
2020-12.

This page is the hook-author contract. For deployment settings, limits, and
startup troubleshooting, see
[Operating Record Schema Contracts](Record-Schema-Contract-Operations). For
the resulting client document, see
[Record Schema Contract API](Record-Schema-Contract-API).

## Registration

Export a synchronous `registerRecordContractContributors()` function from the
installed hook package's main module. The recommended `defineRedboxHook()`
helper exposes that function on the CommonJS hook export. The registration
function must return an array immediately; contributor `compile()` functions
may return a value or a Promise.

Every contributor has these common fields:

| Field | Contract |
|---|---|
| `kind` | Exactly `component` |
| `key` | Globally unique stable identity matching `[a-z0-9][a-z0-9._:/-]*` |
| `version` | Non-blank stable version matching `[A-Za-z0-9][A-Za-z0-9._-]*`; change it when emitted contract semantics change |
| `nullability` | One of `non-null`, `nullable`, or `configuration` |
| `compile` | Deterministic dialect-neutral compiler returning the appropriate contribution type |

The loader discovers contributors on every process start, including when
generated shims are reused. Registry order and hook precedence do not provide
an override mechanism: keys and targets must remain unique.

### Component registration

A `RecordContractComponentContributor` targets one exact form component class
through `componentType`. Only one contributor may target a component type.
`ownedPointers` must contain at least one valid RFC 6901 pointer relative to
the component's form-owned field root. Entries must not overlap each other;
`''` means the field root itself. Declaring a pointer claims ownership but does
not create a node at that pointer.

The compile context is an immutable snapshot containing:

- `component`: the selected `FormComponentDefinitionFrame`;
- `pointer`: the component's absolute RFC 6901 metadata pointer;
- `publicContext`: only `brand`, `portal`, `kind`, `recordType`,
  `workflowStep`, `form`, `operation`, `unknownProperties`, and `enforcement`;
- `compileChildren()`: the compiler-owned way for a structural component to
  compile nested `FormComponentDefinitionFrame` values.

Return `{ kind: 'node', node, diagnostics? }` for a persisting component. A
layout/display component returns `{ kind: 'non-persisting' }`; it may provide
`children` for the compiler to traverse at the current form level. A
persisting component must have a metadata field name.

## Dialect-neutral output

Contributors return `ContractNode` IR, not a schema document or schema
fragment. The supported node kinds are:

| Kind | Required shape |
|---|---|
| `scalar` | `scalarType` is `string`, `number`, `integer`, or `boolean`; optional `enum` contains scalar values |
| `object` | `properties` maps names to nodes and `unknownProperties` is `allow` or `declared` |
| `array` | `items` is another node |
| `any` | A deliberately permissive node; `reason` may describe a supported partial-contract case |
| `conditional` | A dialect-neutral `ContractCondition`, `thenNode`, and optional `elseNode` |

Every node requires an explicit boolean `nullable`. Nodes may carry
`description`, JSON-only `default` and `examples`, and JSON-only extension
annotations. Annotation keys must be a non-reserved `x-...` or namespaced
keyword accepted by the renderer. Defaults and examples describe the contract;
they do not mutate submitted metadata.

> **Do not return JSON Schema fragments.** Return only the documented IR fields:
> for example, use `{ kind: 'scalar', scalarType: 'string', nullable: false }`
> instead of `{ type: 'string' }`, and use `properties` only inside an IR
> `object` node. Never introduce renderer-owned `$schema`, `$ref`, `$defs`,
> `required`, or other JSON Schema keywords. Contributors must also never return
> or annotate functions, validators, expressions, regular expressions, class
> instances, dates, maps, sets, promises, service objects, Sails globals,
> request/caller/record values, or any other executable or runtime value.

Contributor output must consist of plain JSON-safe data plus the documented IR
shape: finite numbers, dense arrays, enumerable data properties, no symbols,
accessors, cycles, `undefined`, or non-plain object prototypes. ReDBox clones
and validates the output before using it and deep-freezes compiler inputs so a
contributor cannot mutate form or context state.

## Minimal component contributor

This example intentionally emits IR with no JSON Schema dialect keywords. It
is mirrored exactly by
`support/documentation/examples/record-contract-contributor.ts`; the
documentation test rejects drift, and the documentation fixture TypeScript
configuration compiles it against the exported contributor types.

<!-- record-contract-contributor-example:start -->
```typescript
import { defineRedboxHook, type RecordContractComponentContributor } from '@researchdatabox/redbox-core';

const exampleValueContract: RecordContractComponentContributor = {
  kind: 'component',
  key: 'example.value',
  version: '1',
  componentType: 'ExampleValueComponent',
  ownedPointers: [''],
  nullability: 'non-null',
  compile: () => ({
    kind: 'node',
    node: { kind: 'scalar', scalarType: 'string', nullable: false },
  }),
};

module.exports = defineRedboxHook({
  registerRecordContractContributors: () => [exampleValueContract],
});
```
<!-- record-contract-contributor-example:end -->

`componentType` must exactly match the custom component's configured
`component.class`. The empty owned pointer and the scalar node both describe
the form-owned field itself.

## Ownership and nullability

The form compiler owns form field roots. A component contributor may claim
only the relative pointers declared by `ownedPointers`. ReDBox records ownership
for collision detection and fails the whole compilation if two components
attempt to own the same path. There is no last-registered-wins behavior.

Choose nullability deliberately:

| Policy | Use |
|---|---|
| `non-null` | The component node must have `nullable: false` |
| `nullable` | The component node must have `nullable: true` |
| `configuration` | `compile()` derives the node's boolean nullability only from stable component/form configuration |

The compiler enforces the literal `non-null` and `nullable` declarations for
component contributions. Every component node is independently validated to
require a boolean `nullable`. Nullability is structural acceptance of JSON `null`; it is
not requiredness and does not replace form/business validators.

An `any` node whose `reason` identifies a permissive case, or a nested node of
that kind, makes `x-redbox-completeness` partial. Do not use permissive output
to hide an unknown shape without a diagnostic and rollout review.

## Determinism and diagnostics

The same immutable compile input and contributor version must produce the same
contribution. Do not read the clock, randomness, environment, filesystem,
network, database, mutable global state, or a lifted Sails application. Do not
derive output from caller identity, roles, request data, record values, or
exceptions. Sort contributor-controlled collections when their order is not
semantic; ReDBox sorts registry entries, object properties, diagnostics, and
other compiler-owned unordered output, but preserves semantic arrays such as
examples.

Optional diagnostics use `RecordContractDiagnostic`: stable `code`, `severity`
(`info`, `warning`, or `error`), safe `message`, and optional `pointer` and
`componentType`. Messages and annotation values become part of the immutable
document and its digest. They must be deterministic and must not contain raw
configuration, validator expressions, exception text, secrets, record data,
or user data. ReDBox attaches the authoritative contributor identity (`key`,
`version`, `source`, and extension `namespace`) and deterministically orders
diagnostics.

Thrown errors and malformed contributor output are reported through the safe
`record-schema.contributor-failed` boundary; raw thrown text is not published.
A valid diagnostic does not excuse invalid IR.

## Limits and failure behavior

Contributor work shares the configured bounds documented in
[Operating Record Schema Contracts](Record-Schema-Contract-Operations#limits-and-bounded-work):

- `maxDepth` bounds IR, conditions, and cloned contributor output;
- `maxProperties` bounds the complete contract and nested contributor nodes;
- `maxDocumentBytes` bounds each contribution's output estimate and the final
  canonical schema document;
- `maxDiagnostics` bounds the complete compiler diagnostic set;
- `contributorTimeoutMs` bounds each synchronous or asynchronous `compile()`
  call by elapsed wall-clock time.

A breach fails the compilation with its exact `record-schema.limit-*` code.
The compiler does not publish a truncated contribution or schema. JavaScript
cannot pre-empt a synchronous callback, so contributor code must avoid blocking
work even though elapsed synchronous time is charged to the timeout.

When `recordSchema.enabled` is `true`, invalid discovery and registration are
fatal lift findings. Duplicate keys, component types, or namespaces map to
`record-schema.contributor-duplicate`; malformed exports, names, pointers,
overlapping roots, and form-path overwrites map to
`record-schema.contributor-invalid`. The startup gate also fails for missing
core contributor coverage or when a configured form triggers a contributor,
contract, renderer, or limit failure. Findings are aggregated and sorted in
`RecordSchemaLifecycleError`; fix all findings before retrying the lift.

An unregistered custom hook component is different: it produces a permissive
partial contract and an `x-redbox-unsupported-component` diagnostic. It is not
an override and should be resolved before enforcement. An unregistered
persisted core component is a fatal coverage defect.

## Related documentation

- [Operating Record Schema Contracts](Record-Schema-Contract-Operations)
- [Record Schema Contract API](Record-Schema-Contract-API)
- [Using a Sails hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox)
- [Redbox Loader](Redbox-Loader)
