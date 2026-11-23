# Generated Reference Documentation

ReDBox publishes a source-derived developer reference at:

https://redbox-mint.github.io/redbox-portal/

The generated site complements this wiki. Wiki pages explain architecture, workflows, and longer examples; generated pages report current supported hook contracts, form configuration properties, defaults, visitor and Angular wiring, source locations, and machine-readable schemas. The REST API remains an independently generated product composed under the same landing page.

## Local commands

From a clean checkout, use Node 26.12.1 and npm 11.20.0. Install the pinned
root and Angular dependencies and build the packages that the documentation
compiler imports. Generate both sets of reference files before running the
checks.

```bash
npm ci --ignore-scripts --strict-peer-deps
npm --prefix angular ci --ignore-scripts --strict-peer-deps
npm run compile:raido
npm run compile:rva
npm run compile:sails-ng-common
npm run compile:agenda-sqs
npm run compile:core
npm run doc:api
npm run docs:generate
npm run docs:check
npm run docs:test
```

`doc:api` writes the REST artefacts into `support/docs/generated/api`.
`docs:generate` copies them into `.tmp/generated-docs-site/api` and writes the
catalogue and schema alongside them. `docs:check` reads those generated outputs.
Use `npm run docs:serve` to preview the generated site.

Use `npm run docs:audit` when only the advisory health artifacts are required. It writes:

- `.tmp/documentation-health/documentation-health.json`
- `.tmp/documentation-health/documentation-health.md`

After generating the REST and composed references, use `npm run docs:test` for lifecycle parsing, reference regression controls and example synchronization tests. `docs:generate` and `docs:audit` also run `npm run docs:examples` and compile the
standalone fixtures through public package imports. Build the core packages before
these checks.

`docs:examples` discovers every fenced `ts` or `typescript` block in nonignored
Markdown/MDX documentation under `wiki`, `doc`, `docs` and `documentation`
directories, all repository READMEs, and the API2 migration guide. It type-checks
each block as an isolated TypeScript module, preserving relative import locations
and resolving public package exports without source aliases. Include imports and
input declarations in complete examples. Diagnostics point to the original page
and line. The gate writes checked/opted-out counts, every block and any diagnostics
to `.tmp/documentation-health/typescript-examples.json`.

For an intentionally partial snippet, put an explicit reason immediately before
its fence, for example `<!-- docs-example:skip partial: Method body; the containing service supplies the operation inputs. -->`.
For historical snippets, use `docs-example:skip legacy: <reason>` and label the
immediately preceding prose paragraph **legacy**. Each marker exempts only the
next block. An unmarked block is checked even on a historical page. Type-check
suppression comments are rejected in checked examples; missing imports or removed
exports must be fixed or explicitly identified as partial/legacy.

If a complete snippet needs dependencies from an Angular or other repository
workspace, use `<!-- docs-example:context path/to/workspace/source-directory -->`
immediately before its fence. The directory must exist inside the repository.
The block is still checked strictly, using normal package resolution from that
directory; it is not opted out. The manifest records the context and diagnostics
still identify the original Markdown page and line. The translation editor import
list uses its actual Angular application directory this way.

## Classification metadata

Only explicitly classified contracts are published. The extractor reads v6 declarations and owned domains directly; removed shim registries and controller base classes are not catalogue inputs. Add `@extensionPoint` to a supported owned domain, v6 extension/lifecycle protocol, form contract, or form component. Combine it with `@experimental` or `@deprecated` for those lifecycle states. Mark non-public contracts with `@internal`. Registered surfaces without a lifecycle tag remain unpublished and appear as `unclassified` in the health report.

The `@extensionPoint` text should explain how hooks extend or replace the contract. Use `@remarks` for important caveats and canonical GitHub Wiki URLs in `@see` tags for longer guidance. Validated examples live in `support/documentation/examples` rather than source comments.

## Outputs

The site contains searchable HTML plus:

- `artifacts/catalogue.json`: versioned normalized catalogue for agents and tools.
- `artifacts/catalogue.md`: concise human-readable catalogue.
- `schemas/form-config.schema.json`: downloadable FormConfig JSON Schema.
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

The TypeDoc reflection model is an internal intermediate under `.tmp/documentation-intermediate` and is not published.

## CI and publication

Branch and pull-request builds generate the documentation-health JSON and Markdown as CircleCI artifacts. Health findings are advisory. Public-contract, example-compilation and generated-link checks fail the build when they disagree. On `master`, CircleCI generates both documentation products, composes the complete site, records the source commit and generation timestamp, and publishes `.tmp/generated-docs-site` to `gh-pages` using the repository-pinned publishing dependency.

## API2 reference validation

Run both `npm run doc:api` and `npm run docs:generate` after changing public
transport or extension contracts, then `npm run docs:audit` and `npm run docs:test`.
The validated hook example uses `RedboxExtensionV2` and concrete application inputs;
the contributor example exports a contributor for explicit binding. The catalogue
includes public controller, route, context, hook/fallback and offline factory/work contracts; its validated hook
example uses `ApplicationModule` without an application global. `ApplicationModule`
still has an advisory missing lifecycle classification and is not published as a
separate surface. Advisory findings remain visible and do not constitute runtime
qualification. `npm run docs:check` fails for missing or private published protocols, stale member
contracts, or generated OpenAPI differing from the executable declarations and
normalized controller targets. It also checks local generated-site links. Protocol
coverage includes every public export from the authoring contract files; adding one
requires lifecycle documentation. See the [API2 migration guide](../specs/fastify-migration/extension-api2.md)
and [FM-041 compile-gate evidence](../specs/fastify-migration/evidence/FM-041.md#review-round-2--compatibility-logging-and-workspace-compilation).
Run `npm run docs:examples` directly after updating wiki or migration-guide
examples. The wiki and generated reference checks for the selected runtime are
recorded in [G7 evidence](../specs/fastify-migration/evidence/FM-048.md).

Operators/API clients must also review [all intentional v6 behavior changes](V6-Client-Compatibility.md).
Generated extension references do not replace the upgrade and recovery runbook.

When `doc:api` specializes paths with `--branding` / `--portal`, set the same
`DOCS_API_BRANDING` / `DOCS_API_PORTAL` values for `docs:check` and `docs:test`.
CI generates before testing and checks the published `default/rdmp` reference
with those explicit values.
