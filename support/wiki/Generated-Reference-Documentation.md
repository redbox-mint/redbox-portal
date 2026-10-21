# Generated Reference Documentation

ReDBox publishes a source-derived developer reference at:

https://redbox-mint.github.io/redbox-portal/

The generated site complements this wiki. Wiki pages explain architecture, workflows, and longer examples; generated pages report current supported hook contracts, form configuration properties, defaults, visitor and Angular wiring, source locations, and machine-readable schemas. The REST API remains an independently generated product composed under the same landing page.

## Local commands

Install the repository's pinned dependencies before generating documentation.

```bash
npm ci --ignore-scripts --strict-peer-deps
npm run docs:generate
npm run docs:serve
```

`docs:generate` writes the composed site to `.tmp/generated-docs-site`. If `npm run doc:api` has already populated `support/docs/generated/api`, those REST artifacts are copied beneath `.tmp/generated-docs-site/api`; otherwise the site contains a reminder page.

Use `npm run docs:audit` when only the advisory health artifacts are required. It writes:

- `.tmp/documentation-health/documentation-health.json`
- `.tmp/documentation-health/documentation-health.md`

Use `npm run docs:test` for lifecycle/inheritance, publication classification and validated configuration/provider example tests. Run `npm run validate:api-routes` alongside these checks after contract or route changes.

## Classification metadata

Only explicitly classified contracts are published. `@public` alone is TypeDoc visibility, not a supported-extension classification. Add `@extensionPoint` to a supported service, controller, hook protocol, form contract, or form component. Combine it with `@experimental` or `@deprecated` for those lifecycle states. Mark non-public contracts with `@internal`. Registered surfaces without a lifecycle tag remain unpublished and appear as `unclassified` in the health report.

Internal service members are excluded even when their container is supported. Explicitly tagged protected registration methods are included without becoming Sails shim actions.

The `@extensionPoint` text should explain how hooks extend or replace the contract. Use `@remarks` for important caveats and canonical GitHub Wiki URLs in `@see` tags for longer guidance. Validated examples live in `support/documentation/examples` rather than source comments.

## Outputs

The site contains searchable HTML plus:

- `artifacts/catalogue.json`: versioned normalized catalogue for agents and tools.
- `artifacts/catalogue.md`: concise human-readable catalogue.
- `schemas/form-config.schema.json`: downloadable FormConfig JSON Schema.
- `schemas/publication-publishing.schema.json`: unified PublicationPublishing envelope schema. Provider schemas and semantic validation are also required; the envelope alone does not validate remote settings or authorize work.
- `api/`: independent REST API reference.

The generated form contract includes `FormConfig.validationOperations` and the
`SaveButtonComponent.operation` property. Its tested save-button example shows
how operation intent coexists with the legacy interactive group array. The
generated extension catalogue also publishes `RecordValidationService`,
including its metrics-hook and bounded shadow-report surfaces. The REST
reference documents `?operation=` on create, metadata update, and workflow
transition routes plus the additive safe validation issue fields.

The catalogue also publishes the `RecordsService` concurrency extension
contract and the exported value-free concurrency observability contract. The
REST reference is expected to include `If-Match`, successful `ETag` headers,
form fingerprints, and the typed 409/412/428 response variants. Run both
`npm run validate:api-routes` and `npm run docs:audit` after changing these
contracts.

The publication reference publishes `PublicationService`'s supported hook/registration
surface and the classified provider, execution, preparation, repair and configuration
contracts. Host-owned source-save, worker, migration, authority and administration
methods are internal. Provider/configuration examples come from
`support/documentation/examples/publication-provider.ts` and
`support/documentation/examples/publication/configuration.json`. Tests and generation
validate the latter against the actual unified schema and registered Figshare/Oni
adapters; generation fails on an invalid publication example. The published schema
is the configuration envelope, complemented by adapter schemas/semantic checks.
See [provider development](Publication-Provider-Development),
[configuration](Shared-Publication-Configuration) and
[cutover/recovery](Shared-Publication-Operations).

Stage 2 additionally publishes the namespaced target, catalogue source, local code,
mapping edge, immutable revision, crosswalk, actor, import and resolution contracts
from `services/publication-vocabulary/contracts.ts`. The typed
`support/documentation/examples/publication-vocabulary.ts` fixture is compiled and
its URI import is validated against the actual API schema during generation/tests.
Explicit revision pins and string outputs are retained. The administration switch
and forward-only conversion have their own [release runbook](Shared-Publication-Vocabularies).

The TypeDoc reflection model is an internal intermediate under `.tmp/documentation-intermediate` and is not published.

## CI and publication

Branch and pull-request builds generate the documentation-health JSON and Markdown as CircleCI artifacts. Findings are advisory and do not fail the build. On `master`, CircleCI generates both documentation products, composes the complete site, records the source commit and generation timestamp, and publishes `.tmp/generated-docs-site` to `gh-pages` using the repository-pinned publishing dependency.
