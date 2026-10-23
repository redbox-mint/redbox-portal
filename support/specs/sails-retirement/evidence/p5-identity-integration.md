# SR-036 — owned identity administration and integration operations

## Completed declarations and sources

All **117 SR-036 declarations** have standalone adapters. This includes the
previously accepted **32** identity/query/RVA declarations, the remaining **84**,
and **1** single-record indexing declaration found misclassified as a page.
The exact methods, URLs, action names and policy identities are in
[the route inventory](route-inventory.json). No declaration was removed to obtain
coverage. Extraction is `4f0cf84ad`; protected HTTP/linking is `3ce52f834`;
upload/native collaborators are `1e7045a0f`; closure is `54e20da55`.

New adapters: `identityLinks`, `vocabularyAdministration`, `formVocabulary`,
`siemWrites`, `adminOperations`, `brandingOperations`, `figshareAdministration`,
`integrationOperations` and `configuredActions`. These build on the accepted
identity, authorization, query and RVA operations. Selected operations receive
facts and narrow collaborators rather than HTTP objects or a service locator.

`identity/Users` now also owns tenant-qualified list/link/audit disclosure and
linking ACL rewrites through SR-035's writer. Secret fields and foreign-brand
roles are removed before disclosure. Both linked identities and their record
rewrites remain scoped to the selected brand. Invalid/self/already-linked targets
are pre-write refusals; membership/ACL/audit failures after effects retain the
existing partial-failure semantics.

The existing branding, logo, CSS, typeface, email, form-vocabulary, Figshare
vocabulary and SIEM algorithms are extracted once into owned modules. Comparison
services delegate and own instances on their application. Figshare HTTP tracing
now accepts an explicit logger; legacy worker/admin callers pass theirs. There
is no global Sails/legacy controller import in the owned graph.

## Policy and public behavior

Every multi-route adapter resolves **all** effective action/controller policies
before mounting its first route. Mutation handlers use owned CSRF/browser or
verified bearer exemption, checkAuth, actual tenant membership, required Admin
role or selected action authorization, object ownership, validation and audit.
Original alias action names are retained when resolving policy overrides.

Branding retains revision-checked drafts, publish/history/restore and real
logo/font/theme collaborators; preview URL issuance accepts root context and
encodes brand/portal. Actual page rendering/static lookup remains SR-040.
Vocabulary CRUD/reorder and configured service/HTTP lookups use the existing
brand-scoped repositories/providers. Figshare source/catalogue/crosswalk/approval/
preview/apply/sync paths use real local HTTP fixtures and persisted run state.
SIEM saves masked credentials and tests a **saved** authorized destination; it
cannot be turned into an arbitrary credential-bearing proxy.

Named configured actions are selected at composition time as `{ authorize,
execute }`, receive actor/brand/portal/body/query facts and have an awaited audit.
There is no dynamic expression evaluation or generic controller emulator.
Unknown actions return 404. Notification rendering uses the existing template
operation and a real SMTP transport; transient rejection is reported as failure.
Index-all pages tenant-qualified records. Single-index checks record ownership.
Remove-all now awaits a **brand-scoped** Solr deletion instead of a global wildcard.
These deliberate security changes and client conversions are in design §1.3.

Legacy GET cache refresh remains available with mandatory CSRF for session
clients (verified API bearer still exempts); HEAD returns 405 and has no effect.
Read-only POST previews are also protected. Constructors do not activate ordinary
upstream work; the preserved failed-initialization fixture verifies no provider
request before successful admission.

## Actual verification and limits

The [final integrated command](p5-api-closure.md#commands-and-results) runs the
preserved **15** identity/query/RVA cases, **12** integration administration cases,
and the writer suite's real linking case, without failures/pending. The full
matrix is **146 passing**, with **34 Bruno requests / 53 assertions**, all executed.
Actual Mongo, Solr, HTTP Figshare/SIEM/vocabulary and SMTP providers are used.
SVG sanitization and WOFF2 inspection execute against real bytes, not mocked
success responses. Tests cover stale branding revisions, catalogue retry, SMTP
transient rejection, masked destinations, tenant-scoped Solr removal, malformed
inputs, foreign roles/objects and browser CSRF.

Selected Users overrides, configured vocabulary lookups and configured actions
are exercised. Existing independent branding/email/form-vocabulary regressions
pass **87/87** (`independent-regression3.log`); the retained combined compatibility
regression passes **139/139** (`compat-drain-regression2.log`). Full Mongo-backed
core, strict checks, versions, commits and failure corrections are in API closure.

These are local external-provider fixtures, not delivery to a production Figshare,
SIEM or institution SMTP server. No new exactly-once or rollback promise is made:
a failed audit/transport can follow completed effects and responses say to inspect
current state before retry. Full remote Companion transfer ownership remains the
separate, evidenced upstream blocker in [SR-042](p6-uploads.md#companion-external-blocker).
No independent SR-036 declaration is deferred behind it.
