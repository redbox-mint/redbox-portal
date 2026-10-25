# V6 operator and API-client compatibility changes

Review this list before the maintenance window. It records the intentional public
breaks in the [design, section 1.3](../specs/sails-retirement/design.md#13-recorded-http-compatibility-breaks)
and the subsequent production-composition regressions/decisions. The usual URLs
and envelopes remain unless the row below explicitly changes them. Complete the
[v6 upgrade/recovery procedure](../specs/sails-retirement/upgrade-recovery-v6.md)
with your exact clients, hooks, identity provider and topology. Internal test
qualification does not designate a representative institution.

| Change in v6 | Affected clients/operators | Required remediation |
|---|---|---|
| Protected API reads return **401** with a Bearer challenge for missing/invalid credentials; protected browser record-form/branding reads also enforce authentication. Legacy paths could return 403 or HTML login redirects. Revoked bearer credentials return 401. | Record-type, configuration/forms/translations, metadata, record/query/report/history and identity clients; custom branding/form callers | Supply an authorized bearer credential or a fresh browser session. Treat 401 as authentication failure, never as successful HTML. Public translation namespace reads remain public. |
| Authenticated routes require membership in the requested brand, including paths without a matching legacy rule. | Multi-brand API integrations and browsers | Use the owning brand's URL and obtain an approved membership there. A credential from another brand is insufficient. Public routes retain their documented default-role rules. |
| Every record read/export checks stored brand and current view ACL. Graphs check each object and both endpoints of every edge. Record-form delivery also verifies the stored brand. | Metadata, permissions, audits, relationship graph, export and form clients | Repair missing stored brands with the data owner; request the owning brand and obtain view access. Do not depend on cross-brand object IDs or disclosure of denied graph nodes/edges. |
| Reporting/search/history require authentication and brand membership. Audit/integration-log reads also verify the stored object's brand; integration audit and permission diagnostics require that brand's Admin role. | Report/history/log integrations and permission diagnostic tools | Use the owning brand's URL and membership. Obtain its Admin role for integration audit/permission diagnostics; object IDs alone never grant access. |
| Record writes/harvest require authenticated actor, owning-brand membership and current create/object/workflow grants. Duplicate harvest requests authorize existing objects before returning a checkpoint. | CRUD, transition, harvest and retry clients | Use approved credentials and grants in the target brand; supply browser CSRF or verified API bearer. Preserve ETag/schema/concurrency/partial-save reconciliation behavior. |
| Missing records/form targets return **404** instead of dereference-driven **500**. | API clients and record-form error handlers/monitoring | Handle 404 as absent/unavailable data; stop retrying it as an internal server failure. Validate the ID and access before retry. |
| Branding, vocabulary, Figshare, SIEM, notification and indexing administration requires the owning brand's Admin role and action policy. Single-record indexing checks ownership; remove-all clears only that brand's Solr documents. | Administrative scripts and whole-installation reindex tools | Authorize and submit work separately for each brand. Obtain the brand Admin role and use its URL. |
| Legacy unsafe GET cache refresh requires browser CSRF or a verified bearer credential; HEAD returns **405** without effects. | Cache-refresh links, monitoring and admin automation | Send an authenticated, CSRF-protected request; do not use HEAD to trigger changes. Respect `Allow` and supported method contracts. |
| Identity/query-definition/RVA writes require owning-brand membership and Admin role; self profile/token operations use the authenticated actor. Target accounts/vocabularies must belong to the brand. Account linking scopes memberships, disclosure and ACL rewriting to that brand. | Account-link, profile/role, named-query and vocabulary import clients | Use brand-scoped Admin credentials for administration; preserve other-brand memberships. Self updates must not request role changes. |
| Workflow and record authorization use only the actor's roles in the requested brand. An identically named Publisher/Admin role in another brand no longer authorizes the transition or action. | Multi-brand workflow clients and hook authors | Assign the required role in the owning brand; preserve the global identity snapshot only for identity operations that explicitly require it. |
| A brand Admin cannot change another shared account's global profile/password, enabled status or API credential when that account has memberships in other brands. Brand-scoped role edits and authenticated self profile/token operations remain available. | Multi-brand Manage Users administrators and provisioning scripts | Let the account owner perform global self-service changes. Manage each brand's roles through its authorized URL; a brand Admin role does not authorize taking over the shared global identity. |
| Role edits write only the requested brand's membership edges, preserving concurrent grants and revocations in other brands. HTTP handlers pass that brand as the optional third argument to `Users.updateUserRoles`. | Multi-brand role administrators and hooks overriding the Users service | Honor the supplied `brandId` when overriding role updates. Do not replace all memberships using foreign roles copied from an earlier user snapshot. |
| Account linking rejects a primary account with foreign-brand memberships as well as a foreign/shared secondary account. A linked alias authenticates with the primary's global permissions, so a local administrator cannot safely grant that alias access to other brands. | Account-link administrators and users with shared accounts | Keep cross-brand identities separate; link accounts only when both belong exclusively to the requested brand. There is no installation-wide override implicit in a brand's Admin role. |
| User audit HTTP reads return only events whose recorded context identifies the requested brand. Foreign-brand, malformed and historically unscoped events are withheld even for shared accounts. | Manage Users audit/history clients and multi-brand administrators | Use each owning brand's authorized URL. Retain original audit data; reconcile historical ownership with the data owner before assigning a trusted brand. |
| Unknown role names and malformed/structured identity inputs return **400** before effects. Role creation accepts declared path `roleName` when valid body/query aliases are absent. | Provisioning scripts and Manage Users extensions | Send known role names and scalar fields. Valid body/query precedence remains. Read state before retrying a failed multi-step profile/role/audit/vocabulary operation. |
| Lists apply filters as independent AND predicates; tenant/type/workflow restrictions cannot be replaced. `filterFields` now reads its own named parameter instead of accidentally splitting `filter`. | Record list/search clients | Send comma-separated field names in `filterFields`, and supply each independent filter. Do not rely on overriding mandatory restrictions. |
| Malformed/structured pagination, dates, relationship depths and search-field names return **400**. Numeric prefixes and query syntax in field names are rejected. | Search, reporting/history, record lists, graphs and dashboard clients | Send the documented scalar integer/range/date/field values. Do not send `10junk`, arrays or objects as scalar query parameters. |
| Solr fuzzy searches apply brand/type/workflow as separate filter queries; user `OR` syntax cannot broaden those filters. | Advanced search integrations | Run separate authorized searches when needed. Treat mandatory tenant filters as immutable. |
| Export JSON correctly escapes arbitrary record-type strings; aborted exports stop paging while admitted backend work drains. | Export consumers and abort/retry automation | Parse JSON rather than interpolating metadata strings. Do not infer write/drain completion from closing the connection. |
| Configured actions resolve registered named `{ authorize, execute }` operations. Service expressions are never evaluated; unknown actions return **404**, and unregistered record hooks fail validation. Queued hooks also validate nested operations before their parent can send email or cause other effects; selected Mongo migration validates before rewriting queued rows. | Hook authors, action configuration and persisted workflow hooks | Convert to explicit v6 operation names and selected factories. Register every nested callback before startup or delivery. Review custom expressions; only finite known built-ins are rewritten by migration. |
| V5 browser sessions are invalid after upgrade; one forced login is required. Old session serialization is unsupported. | Every signed-in browser and session-based integration | Plan a maintenance-window login. Select a new cookie name and rotate the secret; verify Secure/HttpOnly/SameSite and deployment-root path with [session configuration](Configuration-Guide.md). Reacquire CSRF and progress grants. Retain staging and byte stores; invalidating sessions must not delete transfer data. |
| Branded logout requires **POST** plus session CSRF; GET returns **405**, `Allow: POST`. | Navbar overrides and login/logout scripts | Fetch `/csrfToken` within the configured root context and submit `_csrf` or `X-CSRF-Token` with the session. Use the coordinated POST logout form. |
| Local malformed credentials return **400**; provider denials/debug mode return safe **403** instead of provider-dependent redirects/error rendering. AAF assertions enforce the configured issuer. | Local login scripts, OIDC/AAF clients and IdP operators | Send scalar local credentials; handle a denial without expecting provider exception text. Configure the exact AAF issuer, validated local redirects and trusted IdP logout origin. |
| Browser REST writes require session CSRF even where old route config said `csrf: false`. An Authorization header alone never exempts a request; only independently verified API bearer auth does. | Custom AJAX, forms and mixed cookie/bearer clients | Send `_csrf` or `X-CSRF-Token`; query-string tokens are rejected. Obtain a new token after session rotation. |
| The CSRF token endpoint is the owned **GET `/csrfToken`** (under the deployment root), returning `{ _csrf }` with no-store headers. Framework-generated CSRF endpoints/helpers are retired. Token fetches and browser writes deny unconfigured origins and sibling sites. | Custom token fetchers, Angular integrations and reverse-proxy operators | Retain the supported JSON/header contract, configure canonical browser origins explicitly and include the session cookie. Do not derive trust from forwarded headers or cache tokens. Page hosts supply `res.locals._csrf`. |
| Tus resumptions bind actor, brand and record and recheck current edit permission. Browser raw requests, including HEAD resume checks, require CSRF; callback/shared secrets cannot replace actor authentication. Locations are root-relative. | Uppy/tus uploaders, callback handlers and reverse proxies | Use a current authenticated actor and CSRF on every applicable raw request, or verified bearer exemption. Resolve returned Locations against the configured origin/root. |
| Unbound v5 staging objects cannot acquire ownership from client-supplied metadata; their bytes remain retained. | Operators and clients with unfinished transfers | Drain v5 uploads before cutover or reconcile ownership from trusted operator records. Do not delete staging during forced login or reassign it from untrusted input. |
| Metadata saves and missing-primary read recovery verify persisted staging ownership before byte access. Read recovery requires the exact record binding; metadata promotion also requires a completed declared tus length/offset. Cancelled-save cleanup retains foreign/unbound staging and historical journal rows without trusted ownership. | Upload clients, attachment readers and storage operators | Finish the upload before saving its metadata. Use the owning actor and brand for recovery, and reconcile historical ownership from trusted records. Retained incomplete uploads can resume; a submitted file ID never authorizes adoption or deletion. |
| Companion shared secrets supplement callback validation and never replace actor authentication, brand membership or edit grants. | Remote attachment/Companion clients | Authenticate the actor and target brand/record as well as supplying the configured secret. An anonymous request, even with a secret, fails authentication (401). |
| Portal progress uses direct Socket.IO grants/events; virtual HTTP subscribe/unsubscribe returns **410**. Grants are one-use and reconnect needs fresh authorization. | Legacy `sails.io.js`/`io.socket` clients and progress widgets | Replace virtual socket HTTP with the v6 direct client. Acquire a fresh grant through CSRF-protected HTTP and rejoin authorized topics after reconnect. Deploy server and browser assets together. |
| Companion **7.1.1** uses its separate WebSocket protocol, one application per process and explicit metrics. Restart needs a fresh process; Redis and periodic pings are unsupported. | Companion operators and custom realtime integrations | Keep its ws protocol separate from portal Socket.IO. Start one selected application per process, remove unsupported options and use a new process for restart. Let the host import Companion first: its version/hash-checked Node loader replaces the unsafe native logger with bounded messages. A preloaded or changed provider refuses startup. |
| Companion remote provider I/O may outlive a stop deadline after transports terminate. Cleanup cron has process lifetime; remote completion, completed-event replay and cross-process transfer recovery are not guaranteed. | Remote-upload clients and shutdown/recovery operators | Keep the Companion temporary directory until process exit. Reconcile provider/record state after interrupted transfers; do not infer completion or replay from transport close. Respect the documented bounded-drain contract. |
| Operational/backend errors are sanitized. Agenda registration logs include job names and omit configured payloads. Request chronicles retain safe operation failures without raw provider messages. Orphan/cyclic linked aliases fail authentication. | Error parsers, log processors, monitoring, linked-account administrators | Use status and safe typed fields; do not depend on raw datastore/provider exception strings or logged job payloads. Inspect selected job configuration directly. Repair primary-account linkage. Read committed state before retrying operations with partial external effects. |
| Record hooks, notification callbacks, configured vocabulary imports and OCFL upload cleanup remain owned until their actual work settles. A timed-out Promise-backed Observable/Effect hook is not retried concurrently. A failed shutdown deadline retains dependencies and live completion permission for a later cleanup retry. | Hook authors, job operators and deployment supervisors | Treat timeout as an unknown in-flight outcome. Await successful stop before maintenance; release or reconcile the original work and retry cleanup. Configure supervisor grace for real job/upload durations. Preserve legacy first-value Observable semantics. |

## Deployment and extension behavior

V6 uses explicit, validated data modules and supported `REDBOX_*` inputs. Legacy
configuration discovery, `.sailsrc`, `sails_*` environment overrides, generated
shims and implicit service/controller registrations are retired. Ordinary arrays
replace; Agenda jobs merge by name. Convert meaningful options and hooks using
[configuration conversion](../specs/sails-retirement/configuration-v6.md) and
[hook migration](../specs/sails-retirement/hook-migration-v6.md); unknown settings
fail before effects. Published historical package names are retained.

Prisma persistence and runtime retirement ship in the same major upgrade. Stop
all writers during cutover. Mixed-version rolling operation and v5 restart over
v6-written state are unsupported; recovery restores the complete consistent
pre-upgrade checkpoint and matching artifacts. MongoDB engine/FCV transitions
remain separate vendor-supported procedures. See the
[upgrade/recovery runbook](../specs/sails-retirement/upgrade-recovery-v6.md).

## Configuration input dispositions

Startup modules supply typed plain data. Number-valued settings require actual
numbers: this includes `api.max_requests`, record row/byte/time limits,
`form.prehydrate.maxVocabSelections`, PDF/Agenda limits, SMTP ports, session
TTL/cookie durations and typed native driver options. Numeric strings such as
`api.max_requests: "20"`, booleans and numeric prefixes are rejected; the named
environment/CLI conversion owners parse their documented numeric inputs explicitly.
String/boolean/array/object settings likewise do not apply incidental coercion or
comma splitting. In particular `"false"` does not disable a boolean setting.
Native open JSON option maps preserve data without recursively coercing it.

Mongo index configuration uses arrays of plain descriptors with object `key`
values, for example `{ key: { redboxOid: 1 }, unique: true }`. Convert driver `Map`
and entry-array key representations to plain objects before returning the data.
Functions, class instances, `Map`, `Set`, `Date`, raw `RegExp` and injected clients
or stores are rejected in startup data. Use selected factories/named operations;
the only startup function exceptions are the three documented DOMPurify hooks.
URI patterns use `{ source, flags }` instead of a `RegExp` instance.

The [complete conversion table](../specs/sails-retirement/configuration-v6.md#baseline-input-dispositions)
covers every inventoried legacy family. Convert `form.forms/defaultForm/formConfigRegistry`
and executable validator/workspace registries to neutral declarations; HTTP
routes/controllers/policies/views/dynamic assets, CORS, `security`, middleware and
service/queue wiring become explicit host/extension inputs. Logging uses
`logging.level`, selected/domain loggers and `PortalHttpOptions.requestLogging`,
including the former `log.requestChronicle` options. Convert `crontab` and bootstrap
callbacks/timeouts/readiness polling to named schedules and awaited owned work.
Sails reload/blueprint/global/hook/pubsub/compiler/webpack and legacy loader copying
settings are retired. Authentication/brand/lifecycle registries and generated
runtime state (`passport`, `brandingAware`, `beforeShutdown`, `appPath`,
`startupMinute`, `recordContractContributorState`, `configmodels`, `dynamicconfig`)
are owned inputs/state rather than startup domain keys. Redis-only
`redboxSession.host/port/db/pass/prefix` were ignored by the baseline Mongo store;
Redis adapters remain unsupported. Export-only defaults, build fragments and
illustrative/unimplemented wiki/spec keys are separately identified in the ledger.

Legacy top-level `raid` data must be converted to the brand's `raidPublishing`
AppConfig or `brandingConfigurationDefaults.raidPublishing`; retain its credentials,
connections and mappings. Baseline preferred the branded block and seeded core
branded defaults before consulting its legacy fallback. Explicitly call
`resolveCompanionConfiguration(selectedEnvironment)` in a selected data module for
legacy `UPPY_*` environment parsing; ambient provider secrets are not auto-discovered.

Preserved inputs include the independent API limit (default **20**), public
`api.additionalClientConfig` overrides, form prehydration, SVG byte limits,
institution navigation flags, `angularDev`, native Mongo index declarations and
`redboxSession.stringify`, sparse email templates, native transport objects and
`smtp://`/`smtps://` URL strings, and uppercase record API method equivalents.
Public client overrides merge last into the existing
whitelist; the server/session/provider configuration is not serialized wholesale.
Configured OIDC identifiers remain unrestricted strings.

The [source inventory](../specs/sails-retirement/evidence/final-review-r13/configuration-inventory.json)
and [acceptance ledger](../specs/sails-retirement/evidence/final-review-r13/configuration-acceptance.json)
retain all paths/fixtures, unresolved expressions, environment reads and excluded
files with their owner, disposition and provenance. These synthetic/source checks
leave the representative institution acceptance gate outstanding.

## HTTP request input scope

Native read routes consume their declared URL path and query fields. The generic
Sails `req.param` lookup is retired: an arbitrary GET request body is not a
supported read transport, even where Sails could previously discover the same
field there. Move read parameters into the route's documented path/query fields.
Write routes consume their declared body and explicit legacy aliases with the
route's precedence; this does not promise every theoretical `req.param` source.
Local login retains passport-local body/query fallback, including configured
nested credential names. Browser administration selects `body.userid`, path-based
enable/disable selects its path ID, and self-service selects the authenticated actor.

Supported legacy inputs include query-selected existing-record editors/forms,
omitted/empty translation listing locale/namespace filters, form vocabulary
boolean spellings and comma-separated/repeated notation lists, and a bodyless
browser vocabulary sync for the latest version. The REST vocabulary sync keeps
its declared required body. API list limits and search limits remain independent.

The following are intentional validation/protocol changes, rather than promises
to preserve malformed or unsafe historical acceptance:

| Input or protocol | V6 contract |
|---|---|
| Arrays/objects supplied to declared scalar fields | Return 400. Declared lists and JSON/record metadata remain supported. |
| Unknown fields | Follow the individual route schema's projection, passthrough or rejection behavior. There is no global rule that strips arbitrary record metadata. |
| Pagination, limits and search fields | Use declared integer/range bounds: positive page/row sizes, nonnegative offsets where declared, and valid field names. Numeric prefixes such as `10junk`, structured scalars and unsafe search syntax return 400. |
| Generic action/service expressions | Use registered named operations as described in the compatibility table above; expression dispatch is retired. |
| Virtual socket HTTP and upload sockets | Legacy subscribe/unsubscribe returns 410. Use the direct Socket.IO grant protocol and the separate pinned Companion WebSocket protocol described above. |

The [complete HTTP acceptance inventory](../specs/sails-retirement/evidence/final-review-r13/http-acceptance.md)
records route/source provenance, supported input regressions, deliberate breaks,
schema comparison cells and focused native-handler cases separately. It does not
replace institution/client acceptance during the upgrade rehearsal.
