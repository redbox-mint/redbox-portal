# Sails retirement evidence summary

This stack integrates the finished Express 5 retirement with Prisma base
`54218bde4`. The complete historical evidence is archived on local branch
`stack/sails-retirement` at **`853f21caa`**, under
`support/specs/sails-retirement/evidence/`. That immutable source remains the
reference for individual reports, probes, inventories, artifact identities,
negative controls and rejected attempts. The evidence directory is deliberately
absent from the review stack. Historical artifacts qualify their recorded
revisions; the current source qualification below does not replace them.

## Phase outcomes

- **P0 — baseline:** captured configuration, routes, resources and behavior;
  assigned migration owners to all **1,261** original inventory entries.
- **P1 — runtime:** explicit application modules own initialization, activation,
  rollback, quiesce, drain and close. An early standalone host proved persisted
  record types and process shutdown without a framework lift.
- **P2 — extensions:** asynchronous ESM/CommonJS discovery, declaration validation,
  precedence and concrete factory inputs replace loader-generated globals.
  Bundled storage/PDF/development hooks and generated consumers were converted.
- **P3 — configuration and orchestration:** offline configuration resolution,
  explicit secrets, index preparation, migrations and bootstrap complete before
  workers or HTTP accept work. Failed or timed-out cleanup retains its owner.
- **P4 — authenticated HTTP pilot:** record-type endpoints, sessions, bearer/OIDC
  authentication and policy/error contracts were exercised against MongoDB,
  including **13** released-v5 differential cases.
- **P5 — domains:** records, storage, queries, forms, identity, dashboards,
  vocabulary and integrations use explicit repositories and collaborators.
  Accepted asynchronous work remains owned through its actual completion.
- **P6 — browser and transfers:** owned EJS/page resources, CSRF, tus, Companion
  and Socket.IO replace Sails helpers and clients. Ownership, cross-brand denial,
  stream cancellation, reconnect and shutdown interleavings have regression gates.
- **P7 — qualification and recovery:** clean packs, installed compositions,
  fresh/restart/stop, MongoDB 8/9 controls and quiescent checkpoint recovery were
  exercised. The historical topology matrix contains **216** checks; its exact
  image revisions remain in the archive rather than being relabelled current.
- **P8 — retirement:** the Express executable is the selected host; Sails
  controllers, policies, responses, loader and runtime dependencies are removed.
  An AST/dependency auditor and original-inventory reconciliation remain permanent
  gates. Design, implementation plan, tasks and the five v6 guides remain shipped.

## Current local qualification

These are local source/compiled-package results for the integrated target T′ and
its evidence-free successor T″, using **Node 26.11.1 / npm 11.20.0** and disposable
MongoDB, Solr and Keycloak fixtures. Pending tests are separate from passing
coverage. Counts from overlapping suites are not added together.

| Gate | T′ result | T″ result |
| --- | --- | --- |
| Ordinary core | 5,717 passing / 7 pending | 5,717 passing / 7 pending |
| Separate real-service core | 224 passing | 224 passing |
| Root integration | 422 passing / 10 pending; zero owned resources after stop | 422 passing / 10 pending; zero owned resources after stop |
| Storage Mongo | 308 passing, no pending | 308 passing, no pending |
| Dev-tools | 61 passing | 61 passing |
| PDF unit | 81 passing | 81 passing |
| Shared forms | 411 passing; browser export checks pass | 411 passing; browser export checks pass |
| Retirement/tooling | 49 passing | 58 passing (nine additional audit controls) |
| Isolated Companion lifecycle / transfers | 2 / 6 passing | 2 / 6 passing |
| Packed consumers | 12 real packs / 20 checks, isolated offline reinstall | 12 real packs / 20 checks, isolated offline reinstall |
| Builds, six core typechecks, host typecheck | Pass | Pass; all 22 Angular project builds also pass |
| Lint / API docs / reference generate-audit-tests | 940 files, no warnings/errors; docs pass (43 surfaces, 524 existing advisories) | 940 files, no warnings/errors; docs pass (43 surfaces, 524 existing advisories) |
| Source closure / baseline reconciliation | Zero executable or dependency violations; 1,261 entries accounted for | Zero executable or dependency violations; 1,261 entries accounted for |

The final archived ordinary-core baseline is **5,641**, after the three
simplification rounds (R28/R29's earlier checkpoint was 5,647). Integration and
regression ports add a net **76** passing cases over that final baseline. New base coverage includes
session TLS, attachment validation, Solr readiness, isolated RVA transport,
Prisma lazy acquisition and vocabulary counting. Storage increases from the
archive's 306 to 308 and PDF from 79 to 81. The other listed suite counts are
unchanged, except the nine relocation-specific audit controls above. Accepted
serial reruns retain all assertions and deadlines; timed-out concurrent attempts
are excluded from the passing totals. One isolated Companion process probe also
passed unchanged on retry. Exact-pin and consumer-lock checks remain enforced.

## WSU institution scope and remaining acceptance

WSU is the designated representative institution. Archived local qualification
used the converted hook and a released-source fallback (v5.0.4 portal plus the
recorded WSU source), faithful local MongoDB 8/9 configurations, installed forms,
vocabulary/dashboard migrations, publication delivery, transfers, restart/stop,
cutover and complete checkpoint recovery. The latest archived WSU suite records
**565** passes. R29 also records 17 WSU migration omission controls. Neither is
claimed as a fresh WSU execution on the newly integrated Prisma base.

Production-only acceptance remains unchecked: identify the actually deployed WSU
image/hook/configuration and source database version; confirm the production
federation/replica-set topology; obtain institutional dashboard/client approval;
qualify production identity, search, workload and availability requirements; and
execute an operator-owned cutover with an external-effect reconciliation
checkpoint. A local stand-in is not production deployment proof. The original
WSU checkout is outside this stack and was not modified.

## Review loops and permanent inputs

The archive contains **29** review rounds reporting **178** fixed findings or
finding groups across portal, tooling, documentation and converted-institution
scope. Group sizes vary; this is a report-accounting total, not a count of
independent security properties. R17 and R29 are the two zero-new-class-A P1/P2
confirmation rounds; R29 closes the recorded **55/55** local task scope. Twenty
inherited defect groups remain separately recorded, including B-20's question-tree
case. They are not silently counted as retirement regressions or passing inputs.

Three subsequent simplification rounds reported **47** findings: **41** applied,
**4** adjusted and **2** skipped, removing **1,302** shipped-source lines. The
first two independent correctness reviews reported zero P1/P2 findings. Round
three retained the asynchronous HTTP forwarding boundary after a timing
regression was detected; its negative controls remain covered.

Five immutable JSON inputs needed by permanent tests now live under
`test/fixtures/sails-retirement/`: configuration inventory and acceptance ledger,
HTTP acceptance inventory, released-v5 upgrade fixture and released-v5 HTTP
results. Their bytes are preserved. The closure auditor, inventory generator,
reconciler and original inventory live under `support/tooling/sails-retirement/`.
The auditor inspects its own executable code and validates the narrowly named
JSON data inputs; positive and negative controls still reject live/evaluated
legacy code. Recovery and all test readers use these maintained paths. Individual
historical evidence links resolve to this summary; consult the archive commit for
full original files and provenance.
