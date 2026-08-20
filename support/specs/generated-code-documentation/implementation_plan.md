# Generated Code Documentation Implementation Plan

## Goal

Replace the obsolete Compodoc output with generated reference documentation that helps developers and agents understand ReDBox's supported extension and integration contracts.

The generated reference complements the GitHub Wiki:

- The wiki explains architecture, workflows, decisions, and longer examples.
- Generated documentation reports current contracts, signatures, defaults, wiring, schemas, and source locations.
- Source documentation links to canonical GitHub Wiki URLs rather than paths below `support/wiki`.

The existing REST API documentation remains independently generated and is published alongside the new reference.

## Agreed Principles

- Document supported extension and integration surfaces, not every internal symbol.
- Generate human and agent outputs from one normalized catalogue.
- Treat documentation metadata as part of the supported API contract.
- Report documentation gaps without failing builds.
- Publish only explicitly classified surfaces; silently incomplete coverage is acceptable.
- Allow agents to add or change lifecycle classifications using repository evidence.
- Keep generated artifacts out of Git.
- Publish documentation from `master` only.
- Keep REST API generation isolated from the extension catalogue.

## First-Slice Scope

### Core hook extension contracts

Generate reference documentation for classified surfaces from `@researchdatabox/redbox-core`, including:

- The core hook registration protocol and supported hook capabilities.
- The base service and controller contracts.
- Classified services and their `_exportedMethods`.
- Classified Ajax controllers and their exported actions.
- Classified webservice controllers as hook override contracts.
- Deterministic route and authorization wiring where it clarifies an override contract.
- Source locations and links.

Webservice controller pages must not include OpenAPI-derived operations, request schemas, response schemas, or links into the REST reference.

### Form configuration contracts

Generate reference documentation for classified surfaces from `@researchdatabox/sails-ng-common`, including:

- The top-level `FormConfig` contract.
- Classified form components.
- Public configuration properties and types.
- Default values and definition mappings.
- Visitor participation.
- Angular component/model mappings.
- Minimal validated examples.
- A downloadable FormConfig JSON Schema.

### Initial published content

The first publication does not require complete classification or documentation coverage. It must include:

- The hook registration protocol.
- The base service and controller contracts.
- At least one representative service and controller.
- The top-level FormConfig contract and JSON Schema.
- Several representative form components with validated examples.
- The separately generated REST API documentation.

## Out of Scope

- Comprehensive documentation of every TypeScript or Angular symbol.
- Angular application internals.
- `redbox-dev-tools` APIs and generator commands.
- Extension points contributed by installed client hooks.
- Runtime discovery through a Sails lift, database connection, or browser.
- Combining or cross-linking the extension catalogue with the OpenAPI model.
- Versioned release documentation. This is future work.
- Documentation coverage thresholds or CI failures based on missing documentation.

## Documentation Metadata

Use source-adjacent TSDoc/JSDoc for concise contract metadata:

- Summary and purpose.
- Extension or override semantics.
- Lifecycle classification.
- Important caveats.
- Canonical GitHub Wiki links using `@see` when longer guidance exists.

Long tutorials and multi-file guidance remain in the wiki. Executable examples live in dedicated fixtures rather than being duplicated in comments.

### Lifecycle classification

Add an `@extensionPoint` tag for intentionally supported extension surfaces and use TypeDoc lifecycle modifiers:

- `supported`: `@extensionPoint` without another lifecycle modifier.
- `experimental`: `@extensionPoint` with `@experimental`.
- `deprecated`: `@extensionPoint` with `@deprecated`.
- `internal`: `@internal`; excluded from the public catalogue.
- `unclassified`: technically exposed but not explicitly classified; excluded from publication and included in the health report.

A service, controller, or form component provides the default classification for its exported methods or public properties. Members may override that classification.

Agents may classify surfaces without separate human approval. Classification should be based on code, tests, wiki guidance, or established hook usage. Ambiguous cases should remain `unclassified` rather than being guessed.

## Generation Architecture

Use TypeDoc as the TypeScript-aware extraction and HTML-rendering foundation, with a small repository-owned enrichment layer.

The pipeline is:

```text
TypeScript source and registries
            |
            v
   TypeDoc reflection model
            |
            +--- ReDBox registry and form-contract extraction
            |
            v
 Normalized ReDBox catalogue
            |
            +--- searchable HTML
            +--- concise Markdown
            +--- versioned JSON
            +--- documentation-health report
            +--- FormConfig JSON Schema
```

The normalized catalogue should have a `schemaVersion`, deterministic identifiers, lifecycle status, source locations, documentation text, examples, and surface-specific relationships. TypeDoc's raw reflection JSON remains an internal intermediate.

### Safe extraction boundary

- Use static TypeScript analysis for services, controllers, hook registrations, routes, and authorization configuration.
- Do not instantiate services or controllers.
- Do not lift Sails or connect to external systems.
- Execute only isolated, deterministic form-library code needed to read dictionaries/defaults and validate examples.

## Form Contract Consistency Checks

Report mismatches across:

- `AllTypes`.
- `AllDefs`.
- Component and model defaults.
- Visitor methods.
- Angular static component/model dictionaries.
- Generated FormConfig JSON Schema.

These mismatches are advisory findings. They do not stop documentation generation.

## Validated Examples

Store examples under `support/documentation/examples/` and render them into generated pages.

- Hook service/controller override examples must type-check.
- Form component examples must validate against the generated JSON Schema.
- Form component examples must also pass the real construction visitor.
- Missing or invalid examples appear in the documentation-health report.

## Generated Outputs

Generate into `.tmp` and do not commit the outputs:

```text
.tmp/generated-docs-site/
  index.html
  extensions/
  forms/
  schemas/form-config.schema.json
  artifacts/catalogue.json
  artifacts/catalogue.md
  api/

.tmp/documentation-health/
  documentation-health.json
  documentation-health.md
```

The site landing page links to two independent products:

- Core extension and form-contract reference.
- REST API reference generated by the existing `npm run doc:api` pipeline.

Generated navigation uses existing ReDBox terminology:

- Hook architecture.
- Services.
- Controllers and routes.
- Configuration.
- Form configuration.
- Form components.
- Schemas and machine-readable artifacts.

## Documentation-Health Report

Produce Markdown and JSON reports containing:

- Unclassified registry entries.
- Missing summaries or purpose statements.
- Missing extension/override semantics.
- Undocumented exported methods or public config properties.
- Missing parameter or return descriptions where types are insufficient.
- Missing or invalid example fixtures.
- Invalid documentation links.
- Form-contract consistency mismatches.

The report is stored as a CircleCI artifact on relevant branch and `master` builds. It is not published on GitHub Pages and does not fail CI.

## Commands and Dependencies

Add predictable root commands:

- `npm run docs:generate`: generate the complete local site and machine artifacts.
- `npm run docs:audit`: generate the documentation-health artifact.
- `npm run docs:serve`: preview the complete generated site locally.

Use local, exactly pinned dependencies. Do not install TypeDoc, Compodoc, Aglio, or publishing tools globally during generation.

Retire `doc-ng2` after the replacement commands are operational. Preserve `npm run doc:api` and its implementation as an independent producer.

## CI and Publication

### Pull-request and branch builds

- Install pinned dependencies.
- Generate the normalized catalogue and documentation-health report.
- Store the Markdown and JSON health files as a CircleCI artifact.
- Do not publish documentation.
- Do not fail based on documentation findings.

### `master`

- Generate the extension/form reference.
- Run the existing REST API generator separately.
- Compose both outputs beneath a new landing page.
- Publish the complete `.tmp/generated-docs-site` tree to `gh-pages`.
- Include the source commit SHA and generation timestamp in the published reference.

Versioned release publication is deferred.

## Implementation Steps

1. Add exactly pinned TypeDoc tooling, `tsdoc.json`, generator configuration, and root scripts.
2. Define the versioned normalized catalogue and diagnostic types under `support/documentation/src/`.
3. Implement hook registration, service, and lifecycle extraction.
4. Implement Ajax and webservice controller extraction without importing OpenAPI data.
5. Implement form-component extraction and consistency analysis.
6. Consolidate or wrap the existing FormConfig JSON Schema generation for publication.
7. Add type-checked hook examples and schema/runtime-validated form examples.
8. Render searchable HTML, concise Markdown, and versioned JSON from the catalogue.
9. Produce the non-blocking Markdown and JSON health reports.
10. Compose the extension/form and REST outputs beneath the new landing page.
11. Update CircleCI for branch artifacts and `master`-only publication.
12. Retire the Compodoc flow and update `AGENTS.md` and relevant wiki pages with generation and publication links.

## Verification

Add focused tests for:

- Custom tag and lifecycle parsing.
- Container-level lifecycle inheritance and member overrides.
- Registry discovery and unclassified reporting.
- Stable catalogue identifiers and deterministic ordering.
- Service/controller extraction without runtime initialization.
- Form dictionary, visitor, Angular mapping, and schema consistency.
- Hook example type-checking.
- Form example schema and construction validation.
- Canonical GitHub Wiki link validation.
- Exclusion of internal and unclassified surfaces from published output.
- Isolation between the extension catalogue and REST API generator.
- Deterministic generation with no tracked worktree changes.

## Acceptance Criteria

- A developer or agent can understand and apply one documented service/controller override.
- A developer or agent can configure one documented form component using its properties, defaults, validated example, and schema.
- The independently generated REST API reference remains available from the site landing page.
- HTML, Markdown, and JSON are generated from the same catalogue.
- Documentation gaps are available as a non-blocking CircleCI artifact.
- Only `master` publishes the generated site.

## Future Work

- Versioned documentation for canonical releases.
- Compatible catalogue generation for client hook repositories.
- Broader classification and remediation of currently unclassified core surfaces.
- A dedicated ReDBox generated-documentation skill for agents.
