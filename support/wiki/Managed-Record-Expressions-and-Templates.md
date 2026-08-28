# Managed Record Expressions and Templates

Managed record-type and workflow definitions treat administrator-authored JSONata and Handlebars source as hostile data. The `ExpressionRuntime` export from `@researchdatabox/redbox-core` is the only supported execution boundary for these new definitions. Legacy form, report, email, and integration expression paths are outside this contract and are not made safe by this runtime.

## Context contract

Every evaluation uses context schema version `1` and one explicit purpose:

| Purpose                | Available data                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transition-condition` | Timestamp, brand and record-type IDs, safe actor identity and roles, projected current/candidate record data, and the transition ID/stages             |
| `action-parameter`     | The transition fields when applicable, action scope, execution/correlation IDs, and validated safe prior outputs in addition to the safe record fields |
| `text-template`        | Timestamp, brand and record-type IDs, safe actor identity and roles, projected record data, and transition fields when applicable                      |
| `output-dependency`    | Brand and record-type IDs plus only the requested fields from one validated safe prior output                                                          |

Projection is by selection, not object spreading. Request and response objects, Sails or service registries, process/environment/filesystem state, sessions, credentials, authorization headers, cookies, tokens, passwords, private keys, secret slots, and prototype-related properties are rejected or omitted recursively. Contexts are cloned and frozen before use and are serialized across an isolated worker boundary; no caller-provided JSONata bindings are accepted.

## JSONata

JSONata is for boolean conditions and JSON-compatible value mappings. Compile source with `compileManagedJsonataExpression`, create the purpose-specific projection, and run it with `evaluateManagedCondition` or `evaluateManagedJsonata`.

The managed custom registry contains only `guessNameParts` and `luxonFormatDate`. Eval-like bindings, dynamic property lookup, server/global names, and prototype-related properties are rejected. Source length, AST node/depth, input bytes/depth/cardinality/work, output bytes/depth/cardinality/work, worker memory/stack, startup, and evaluation time all have server-owned hard limits.

Each evaluation gets a dedicated worker. A hard evaluation timeout terminates that worker and reports `kind: "timeout"` with `workerTerminated: true`. An abort reports `kind: "interrupted"`. This is deliberately distinct from an ordinary action Promise timeout, which remains a non-cooperative timeout and must not be reported as interruption.

## Handlebars

Handlebars is only for human-readable text. Compile with `compileManagedHandlebarsTemplate` and an explicit destination, then render with `renderManagedHandlebars`:

| Destination     | Behavior                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `plain-text`    | Preserves text without HTML entity escaping                                |
| `html-text`     | HTML-escapes the complete rendered text; unescaped mustaches are forbidden |
| `email-subject` | Uses plain text and removes CR/LF header injection boundaries              |
| `url-component` | Percent-encodes the complete rendered value as one URL component           |

Templates use an isolated Handlebars instance. Partials, decorators, dynamic lookup, parent/data traversal, prototype access, raw output, and helpers that reach translation services, property paths, Markdown/HTML generation, attachments, or debug serialization are forbidden. The allowlist contains bounded date, comparison, boolean, string, array, and encoding helpers derived from the shared helper definitions.

## Diagnostics

`ManagedExpressionError` exposes only a fixed schema version, engine, failure kind, bounded code, and worker-termination fact. Expression/template source, context values, result values, library error messages, stack/cause details, and secret material never enter the serialized diagnostic. Callers should log the diagnostic fields with their own safe correlation ID and must not append submitted source or caught library errors.

## Action-plan validation

Action descriptors declare Handlebars destinations. Missing destinations normalize to the safe `plain-text` default for existing version-1 descriptors. Complete action-plan validation compiles JSONata and Handlebars parameters before any handler runs and returns path-addressed `invalid-jsonata-expression` or `invalid-handlebars-template` issues. A resolved binding exposes frozen prepared artifacts under `preparedParameters`; persisted strings never resolve functions, helpers, modules, services, or methods.
