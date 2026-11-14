# MCP reporting: architecture findings and first milestone

## Baseline

Initial reference inspection used local `develop` (799df7045). At the user's direction implementation is based on the generation feature: the current reporting branch starts at 43c91f8f1, exactly the local `feature/llm-record-generation` tip. There is no local or origin branch named `feature/llm-generation`.

The wiki's Architecture Overview, Services Architecture, Redbox Loader, Portal API and Automated Tests pages describe the current conventions. Some installed skills still refer to the old `redbox-core-types` directory; this repository uses `packages/redbox-core`.

## Findings that determine the design

- Core services extend `Services.Core.Service`, expose `_exportedMethods`, and register lazy getters in `ServiceExports`. Controllers and configuration are also surfaced through pre-lift loader shims. Hooks register extensions with `defineRedboxHook`. Do not edit generated `api/` shims.
- `RecordsService.getMeta()` is an internal storage read, **not** an authorized read. `RecordsService.hasViewAccess()` grants visibility for the union of view/edit usernames and view/edit role names. Role names resolve through `brand.roles`, and membership compares role IDs. There is no implicit administrator bypass, and pending emails do not grant visibility. Tenant equality must be checked separately.
- `SolrSearchService.searchFuzzy()` filters `metaMetadata_brandId`, `metaMetadata_type` and four authorization fields. Its existing role-name interpolation and empty-role handling need a small shared authorization helper, preserving the record service's brand-role-ID semantics and escaping Solr values. Its ordinary search argument is query syntax, so MCP must enter through a new literal-text method rather than forwarding model text to that argument.
- Mongo storage owns the Waterline `record` model (`redboxStorage` datastore) and its native `Collection`, obtained from `Record.getDatastore().manager`. Records have `metadata`, `metaMetadata`, `workflow` and `authorization` objects. `createdOn` is normally an ISO string; legacy offsets/native dates require explicit date conversion. Deleted records live in a separate collection.
- Metadata retrieval in the browser controller resolves the authoritative form, builds the caller's client form config, and calls `FormRecordConsistencyService.projectMetadataClientFormConfig()`. Raw metadata, permissions, integration state and audit information must not be returned by reporting. Reporting record retrieval will return only registered fields, after record authorization and form projection, with failures closed.
- Forms have inherited role/mode constraints. Core ships no default record types; demo types are in `redbox-hook-dev`. Reporting is opt-in per record type. Semantic field paths are trusted server configuration only, with per-field role restrictions. Metadata analytics additionally require explicitly configured forms and confirmation that the path exists in the caller's effective view-form schema; used fields narrow the aggregate to that form coverage. No automatic metadata or Solr-schema enumeration. Question-tree forms cannot establish bulk metadata visibility independently of record values, so their metadata fields are excluded for this milestone.
- Existing `ReportsService` implements legacy configurable reports; `NamedQueryService` is an administrator facility. Neither is a safe public query DSL and neither should be exposed to MCP.
- Passport browser sessions deserialize persisted users and resolve linked accounts. Existing bearer authentication hashes ReDBox API tokens; it is not MCP OAuth. AAF JWT assertions and OIDC authorization-code login do not by themselves validate resource-server access tokens.
- External MCP must use independently configured institution-issued access tokens, with signature/issuer/audience/expiry/scope checks, mapped to an existing OIDC ReDBox user and refreshed persisted roles. Reuse the institution issuer and existing username claim mapping where suitable; never accept an ID token, arbitrary identity input, API-key fallback, or caller-selected brand. The institution authorization server remains responsible for PKCE and client registration. Embedded clients can use the existing authenticated REST/session boundary initially.
- API contracts are Zod-based and registered in `api-routes`, generating Sails routes, validation policies, OpenAPI and API Blueprint. A small reporting REST adapter fits these conventions and shares the service with MCP.
- Mongo indexes currently include separate tenant/type/date keys and a unique OID. One tenant/type/creation compound index is reasonable; role and customer-dimension indexes are deployment choices. Authorization comes first in every aggregation; use `maxTimeMS`, bounded facets/pages/groups, no disk spill and output byte limits.
- Package tests use Mocha, Chai and Sinon; full application tests use Docker Compose. Mongo pipeline conformance needs a real Mongo collection, not only a mocked pipeline. MCP tests should use the official client/transports plus HTTP auth tests.

## Implementation plan

1. `redbox-core/src/reporting`: strict Zod operation schemas, mandatory principal, configuration/field registry, shared record authorization, typed provider/result interfaces and Mongo compiler.
2. `services/ReportingService.ts`: direct service primitives, validation, limits, form-safe registered record projection, literal Solr discovery, safe structured audit events. Register service and config through current lazy loader conventions.
3. Mongo hook: expose a reporting method accepting a principal and DSL, constructing its own authorized pipeline through the shared compiler. No raw pipeline method is exposed to consumers.
4. Core REST controller and `api-routes/groups/reporting.ts`: schema/query endpoints using the existing API contract machinery and the same ReportingService.
5. `packages/redbox-mcp`: optional installable hook, current pinned official SDK, thin typed tools, stateless Streamable HTTP `/:branding/mcp`, per-brand protected-resource metadata and a fail-closed OAuth resource-server boundary. Configuration resolves through `brandingAware` for an explicitly enabled existing brand, with a brand-specific resource audience; no principal fields in tool input.
6. Tests: shared authorization parity, malicious queries/configuration, actual Mongo counts/groups/histograms/arrays/pagination, service projection and audits, tool discovery/execution/errors and resource token validation. Run relevant existing record/search/API tests and TypeScript builds.
7. Wiki operations guide and demo configuration/client examples: direct, REST and MCP milestone queries; issuer prerequisites, form coverage, UTC date semantics, indexing/explain and remaining deployment work.

## Deliberate first-milestone boundaries

Full-text discovery uses Solr and then rechecks current Mongo-backed record authorization before returning IDs/registered projections. Index counts are not advertised as authoritative when index permissions can lag. Combining full-text result sets with Mongo analytics, CSV exports, embedded model chat, and operating an OAuth authorization server are later work. ReDBox is the protected resource, not an identity provider or central customer service.

Official protocol references verified during investigation: https://github.com/modelcontextprotocol/typescript-sdk (SDK v2); https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization (per-request bearer authentication, protected-resource metadata, intended-resource audience validation).

## Verification evidence

The isolated Docker suites pass 25 core reporting cases and 9 MCP cases, with real Mongo aggregation and the official MCP client/transports. The relevant existing RecordsService, SolrSearchService, FormsService, FormRecordConsistencyService and API contract suites pass 468 cases; the final search/API rerun passes 104 cases after the last result-schema adjustment. Core, MCP and Mongo storage TypeScript builds pass, as do dedicated new-test type checks and scoped lint/format checks.

A representative native Mongo `explain('executionStats')` used 1,000 synthetic records: 100 in the active brand, including 10 visible to the user, and 900 in another brand. The authorized 2026 count is 10. The planner chose `reporting_brand_type_created`, examining 100 keys and 100 documents in 3 ms. This confirms the tenant/type prefix narrows the scan; date conversion still requires examining that tenant/type subset. These small-fixture timings are development evidence, not production capacity estimates.

The Docker verification used an existing Node runtime image with the current checkout mounted and its compiled packages, plus a fresh isolated Mongo container. The full production Docker image was not rebuilt for this verification. Customer OAuth acquisition/client registration and a live institutional deployment are deployment prerequisites, not tests simulated as completed here.

### Assistant connection screen

The admin layout hosts `GET /:branding/:portal/admin/mcp` and the session-only readiness endpoint `GET /:branding/:portal/admin/mcp/status`. Both enforce persisted, canonical Admin or Librarians roles in the requested brand. There are no legacy user routes or redirects. Admin → Integrations links to the screen. Setup presents six assistant choices (Claude web and desktop share one connector guide), per-step copyable artefacts, schema-only testing, and administrator-only configuration diagnostics. Public setup responses contain no secrets.
