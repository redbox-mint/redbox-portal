# Route-group acceptance (SR-031)

Use this checklist for each independently reviewable read/write slice. Results belong in the [evidence summary](evidence-summary.md); original per-group and authentication reports remain on the archive branch. Unimplemented
routes remain unmounted in the partial host. The manifest is documentation, never
runtime dispatch and never a reason to retry a request through Sails.

- Enumerate exact methods/URLs/contracts, legacy AJAX aliases and effective
  route/action/controller/global policies. Identify the selected domain factory,
  its repositories, configuration, dynamic settings and concrete collaborators.
- Extract the existing operation once. The comparison adapter delegates to it;
  standalone imports load no Sails, CoreBase, core barrel or legacy controller.
  Keep Express requests/responses in the HTTP adapter. Resolve named hook
  replacements before construction; exercise a representative selected override.
- Await bootstrap/readiness and explicit rule-cache refresh before admission.
  Bind `createHttpPolicies` to the application's initialized `PathRules`, dynamic
  default anonymous role and selected SecurityEventService failure operation.
  There is no per-request path-rule repository read. Bootstrap/explicit
  `loadRules()` remain the refresh points used by the comparison service.
- Reuse Zod contracts and existing tests. Verify status, v1/v2 negotiation,
  envelopes, cache/content headers, projection/filter/pagination and current
  brand scoping against released-v5 observations where available. Label later
  intermediate-source features separately. Record intentional breaks in design.
- Exercise unauthenticated/wrong-role/wrong-brand, malformed/repeated/object
  inputs, missing objects and backend failures. Test both matching and absent
  path rules. `checkAuth` preserves permissive *unruled* paths and the configured
  anonymous role; authentication, tenant membership, admin and object grants
  are independent route policies and must not be inferred from OpenAPI metadata.
- Cover relevant Express 5 cases: register static literals before conflicting
  `:name` parameters (especially named-query `collections`), convert unnamed
  wildcard/optional patterns explicitly, join translation wildcard arrays without
  double decoding, and test slash-containing keys, traversal, HEAD/OPTIONS,
  redirects, root contexts, trusted proxy URLs and parser exclusions.
- Keep returned Promise/Observable work and session/native callbacks in the
  existing accepted-work lifetime. Test abort/stop/deadline/retry when a backend
  operation can outlive transport completion; pools close after dependent work.
- Gate protected unsafe methods (including read-only POST previews) on SR-039.
  Record mutations also require SR-043 progress integration and their concrete
  upload providers. Multipart and raw tus/Companion mounts need SR-041/SR-042;
  auth/callback exceptions must be explicit, never inferred from request headers.
- Run focused build, strict application typecheck, lint, real-Mongo HTTP cases
  and relevant existing Bruno/browser/provider cases. Record exact commands,
  versions, source SHA, counts, skips, failures and limitations. Skips do not
  establish acceptance. Full Mongo-backed `test:core` closes the round.
- Rebuild and run `npm --prefix packages/redbox-core test -- --grep "Complete HTTP input inventory"`.
  This permanent gate checks current routes against the preserved acceptance
  inventory. Review every owner/prerequisite and leave task boxes unchecked until
  their criteria pass. The original source-derived route generator and reports
  remain archived; they are not required by shipped tests.

The archived route inventory assigns every core effective declaration at its recorded revision
and the bundled development root redirect. PDF currently contributes no HTTP
routes. Institution routes remain subject to SR-005 designation. `ALL` records
legacy any-method declarations; determine real action semantics and intended
methods before migration. It does not assert that all such methods are safe reads.

SR-032 includes dynamic configuration, forms/workflow/type metadata, translations
and dashboard configuration. Its protected writes remain a separate slice until
SR-039. SR-033 includes reports, search, named queries, audit/history/harvest and
SIEM reads. SR-034 includes record/schema/permission reads and exports; object
authorization, schema compilation and native storage/template providers are real
dependencies, not satisfied by mounting a repository read.
