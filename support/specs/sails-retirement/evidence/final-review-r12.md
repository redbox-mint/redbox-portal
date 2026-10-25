5 class-(A) P1/P2 issues found

# Sails retirement final review — round 12

Feature base `a49366803`, incoming HEAD `2bc244c01`; final runtime/test input
`8318976b6560802afa761b980e539adbff6512ad`. The shared
`stack/sails-retirement` checkout was used in place. No worktree, branch switch,
push, publication or tag. Unrelated untracked GraphQL specification files were
ignored. R1–R11 evidence and the inherited backlog were read before the review.
The Code Review and ReDBox Testing skills were applied, with independent Standards
and Spec/authentication reviews and a primary-owned authentication matrix.

## Verified class-A defects

| ID | Severity | Incoming location | Reproduction and correction | Fix commit |
|---|---|---|---|---|
| R12-01 | P2 | `packages/redbox-core/src/http/express/login.ts:165,267` | After OIDC login, complete local or AAF login in the same browser. Logout follows the previous IdP URL. Retain and use provider logout state only for the completed OIDC identity, matching base `UserController.logout`. Two real HTTP transition cases fail before correction. | `3d57ec4e2` |
| R12-02 | P2 | `packages/redbox-core/src/configuration/portal-domains.schema.json:920,968` | Startup rejects supported OIDC provider arrays, issuer metadata objects and sparse array items, before the real installer can accept them. Align generated configuration typing/schema with the existing installer and base supported shapes, keeping issuer/client-ID requirements. Actual base installs the rejected shapes. Sixteen configuration-layer rows fail before correction. | `afeaef853` |
| R12-03 | P2 | `packages/redbox-core/src/application/portal/http.ts:309` | A rejected signed AAF callback selecting `other/catalog` through body/query renders `default/rdmp` and overwrites the session. Keep the validated request context for failure policies/page rendering. Four body/query email/assertion cases fail before correction; session controls pass. | `88d95a574` |
| R12-04 | P2 | `packages/redbox-core/src/http/express/configurationWrites.ts:78` | A valid admin/CSRF query-only translation enable/disable POST without a body returns 400 before the domain call. Base accepts this input. Permit absent bodies only for this optional-body operation; retain malformed-body and required-body validation. Both true/false native HTTP/Mongo cases fail before correction; both validation controls pass. | `e487ce22c` |
| R12-05 | P2 | `packages/redbox-core/src/authentication/Accounts.ts:355` | Complete default or named OIDC login after a prior provider session, when the current provider advertises no end-session endpoint. The old URL survives and logout reaches the previous provider. Base clears this fact. Reset it before computing current OIDC logout settings; both real protocol transition cases fail before correction. | `8318976b6` |

All five occur in feature-written runtime boundaries. No P1 was verified. Each
fix includes regression tests and the required co-author trailer. No dependency
or lockfile change is part of the fixes.

## Authentication matrix and baseline comparison

The built-in methods are local credentials, AAF's signed JWT assertion, OIDC
(default and named provider strategies), and hashed opaque API bearer tokens.
An established Passport browser session is a separate credential transport and is
included explicitly. There is no separate generic JWT, LDAP, SAML or OAuth login
strategy in the production host; hooks can extend the documented extension seam.
AAF/JWT is not an API bearer token. OIDC names select configured providers through
`id`, rather than adding another account type.

The permanent table is `test/http/authentication-matrix.test.ts` (97 cases),
`test/application/PortalAuthentication.test.ts` (39 cases, including R11's six),
and four persisted-provider rows in `ConfigurationMongo.test.ts`. There are 140
sign-in/configuration cases across these files and 171 cases including the other
configuration HTTP controls. The initial combined run passed 169; the two added
missing-endpoint controls failed, then all 136 final authentication/binding
cases passed after correction. The final full suites below cover the complete tree. Protocol tests use actual
Passport, express-session, HTTP, Accounts and HttpIdentity. Local password
verification/identity persistence use a deterministic repository port; the OIDC
peer is a real HTTP authorization/token/JWKS/userinfo server, with PKCE, state,
RS256 ID-token validation and mapped profiles. Signed AAF assertions use real
Passport-JWT. The four DB rows use real Mongo configuration persistence, explicit
repository reload, and actual strategy installation. The Keycloak real-service
and browser suites separately cover discovery and a deployed provider.

The tables below compare every applicable method/dimension with actual source at
`a49366803`, not with an inferred Sails default. They are dimension coverage,
not a claim that every permutation of account state, configuration source and
protocol error was executed as a separate network test. N/A cells explain where
the method has no such lifecycle. Current results include the documented v6
changes listed after the tables.

| Method | First login / provisioning | Returning identity | Existing in another brand | Disabled identity / disabled primary | Linked alias / orphan |
|---|---|---|---|---|---|
| Local | Base/current: no auto-provisioning; missing credentials/account denied. Local admin bootstrap is separate. | Base/current: verify existing password, await selected hooks/profile operations, resolve effective identity. AJAX success remains 200 JSON. | Neither grants a new membership; v6 requires selected-brand membership before issuing the login session. | Base/current deny; current local AJAX returns `{user:false}` without an authenticated session or profile writes. | Effective primary succeeds; disabled primary denies. Orphans fail closed under the documented v6 rule. |
| AAF/JWT | Base/current: derive encoded subject and selected-brand default roles, apply email rules before create; no row on refusal. R11 context fix preserves body/query/session selection. | Base/current: update mapped profile and last-login; email enrollment restrictions apply to creation, not existing accounts. | Existing roles remain unchanged; v6 denies a session without requested-brand membership. | Base/current deny before profile writes; disabled primary also denies. | Effective primary succeeds; disabled/missing primary denies under current rules. |
| Default OIDC | Base/current: mapped username/email/profile, selected-brand roles, email check before create. Missing mapped username denies. | Base/current: resolve existing account; mapped profile and optional userinfo behavior retained. | No added membership; v6 denies foreign-brand session admission. | Base/current deny disabled account/primary, with no accepted login/profile write. | Effective primary succeeds; disabled/missing primary denies under current rules. |
| Named OIDC | Same account rules as default OIDC; selected real strategy is `oidc-institution`. | Same; provider selection is retained, not treated as another account type. | Same. | Same. | Same. |
| API bearer | N/A provisioning: only an existing stored token hash resolves. Unknown token/account denies. | Base/current: SHA-256/base64 hash lookup and effective linked account; no login audit/session cookie. | Credential does not grant roles; current route membership policy returns 403 for the other brand. | Base/current deny; current requests resolve fresh disabled/primary state every time. | Effective primary succeeds; missing/cyclic linkage fails closed in v6. |
| Browser session | N/A provisioning: a successful interactive login must first create the credential. Anonymous session has no actor. | Base/current deserialize stored user ID and resolve effective identity; the table verifies the resulting `/user/info`. | No new membership; current route policy requires existing brand roles. | Current deserialization rechecks disabled account/primary; disable after sign-in denies the next request. | Effective primary resolves; deleted primary fails closed. Removing roles returns 403 at the next brand gate. |

| Method | Provider absent / inactive / malformed | Return URL and context | Logout and provider logout | Session regeneration |
|---|---|---|---|---|
| Local | Base/current local strategy is installed independently of `active`. Missing local overrides use defaults. Custom credential field names are honored. Malformed request fields return documented v6 400; CSRF is enforced. | Base/current selected-brand `local.postLoginRedir`; session return URL takes priority over query; current rejects foreign/unsafe URLs. Local AJAX returns URL; browser form redirects. | Portal configured destination or brand home. R12 clears former OIDC logout state. POST/CSRF, GET 405, and invalidation follow v6 contract. | Successful `req.logIn` rotates ID; old cookie cannot read user info. Branding/portal and safe return target survive, credentials do not. |
| AAF/JWT | Inactive provider is not installed. A direct attempt against its disabled route yields a sanitized 500, not authentication. Active missing signing key fails preparation. Invalid assertion denies; issuer enforcement is an explicit v6 change. | Validated body/query/session brand is used consistently for provisioning, success redirect and rejected HTML/session context (R11/R12). Same safe return precedence. | Portal destination/home. R12 prevents previous OIDC logout inheritance. Current POST/CSRF clears session. | Successful signed callback rotates session; old cookie denies. Invalid/refused callback grants no authenticated cookie. |
| Default OIDC | Inactive strategy is absent; direct begin fails sanitized 500 and may create an anonymous context cookie. Active missing config/client ID fails preparation. Invalid state denies. Supported URL discovery, metadata object and sparse provider configuration accepted after R12. | Begin binds validated brand/portal and state to session. Callback uses that session context; safe session/query return or selected-brand fallback. | Allowlisted provider end-session URL when enabled; disabled/unlisted/missing provider logout falls back to portal/home. Current adds client ID and uses a parsed endpoint. Base also selected provider logout only for current OIDC accounts. | Actual authorization-code/PKCE callback rotates session. Old cookie denies. Provider logout fact retained only for completed effective OIDC identity. |
| Named OIDC | Same settings/error rules, with explicit named strategy selection. Provider arrays and metadata objects match base support after R12. | Same session-bound flow; named callback retains `id`. | Same enabled/disabled/allowlist checks. | Same real callback rotation. |
| API bearer | N/A external provider settings; always-installed bearer strategy checks existing hash. Invalid explicit Authorization cannot recover through browser session (existing controls). | N/A login return URL. Route brand membership is enforced. | N/A provider logout/session logout: token remains an independent credential; revoke through token management. | N/A: bearer resolution is stateless and never issues a session. |
| Browser session | N/A external provider settings after login; session configuration/version and store apply. Pre-v6 sessions are deliberately invalid. | Normal browser authorization saves the attempted local URL; interactive login consumes it. | Current POST/CSRF removes credential; subsequent info is forbidden. Provider selection derives from completed effective account. | Transport consumes the regenerated cookie, never rotates on ordinary reads. |

The inactive-provider rows deliberately assert **no authenticated actor**, not
absence of every cookie: OIDC begin stores anonymous branding before Passport
reports an unknown strategy. This preserves the disabled-provider direct-route
behavior; it is not a new P1/P2 finding or evidence of authentication success.
First/returning session rows establish local login and inspect real session
resolution; the dedicated session revocation rows then mutate the repository and
issue a fresh request. They do not claim that sessions themselves provision users.

| Configuration source | Local | AAF/JWT | Default OIDC | Named OIDC | Bearer / browser session |
|---|---|---|---|---|---|
| Core defaults | Default credential fields and redirect; always installed. | Inactive; no strategy. | Inactive; no strategy. | No configured named strategy. | Installed credential transports; independent of external-provider `active`. |
| Neutral extension defaults | Custom fields/redirect installed. | Enabled configured signing key installed. | Metadata/public-client settings installed. | Array item installs named strategy. | Same transports; no provider-specific settings needed. |
| Application file | Same resolved values honored. | Same. | Same. | Same. | Same. |
| Environment configuration file | Same resolved values honored. | Same. | Same. | Same. | Same. |
| Local file | Same resolved values honored. | Same. | Same. | Same. | Same. |
| Hydrated default-brand cache | Actual production binding uses hydrated fields/provider values, overriding startup values (R11). | Actual signed assertion strategy installed from hydration. | Actual native strategy installation from hydrated metadata. | Same for named array. | Live identity state remains repository-based. |
| Persisted DB AppConfig / reload | Real DB reload retains custom fields/redirect. | Real DB reload retains signing key and installation. | Real DB reload retains metadata/public-client installation. | Real DB reload retains array and named installation. | No provider data necessary; existing DB-backed identity/session tests qualify transports. |
| Documented environment scalars | Admin username/password/email/token supported. | No general auth-provider scalar mapping. | No general auth-provider scalar mapping. | No general auth-provider scalar mapping. | Admin token seed supported; session secret/configuration mappings covered by existing configuration suite. |
| CLI / unknown environment selectors | `--auth` / `REDBOX_AUTH_ACTIVE` rejected as unsupported configuration inputs. | Same. | Same. | Same. | Same loader contract, no silently ignored selector. |

Baseline provenance: `UsersService.ts:710` installs local/serializers from
hydrated default-brand config; `:1035` installs AAF and chooses request brand;
`:1309` supports OIDC arrays/names/URL or object issuers; `:1430` handles claims,
email enrollment, returning profiles and logout state; `:1723` resolves bearer
hashes. `UserController.ts:118` gives session/query/config redirect precedence;
`:135` selects provider logout by effective current type; `:310` preserves local
AJAX behavior; `:370` selects named OIDC callbacks. Base branding policy and
`BrandingService.getBrandNameFromReq` retain body/query context. Base config/cache
services provide hydrated DB values; v6 static layer names/strict CLI/env rejection
are specified new configuration interfaces, not assertions that Sails had those
same layer names.

Design §1.3/§9 intentionally changes tenant membership gates, rejection
sanitization/debug output, orphan/cyclic links, AAF issuer enforcement, unsafe
redirects, POST/CSRF logout and one-time old-session invalidation. These are
recorded compatibility changes, not unresolved regressions. Provider strategy
registration remains startup-only from hydrated **default-brand** settings, as
in the base; selected-brand request redirects/configuration remain dynamic.

Portable comparison probes are retained in [final-review-r12/](final-review-r12/).
The three independent auth probes deliberately load incoming `2bc244c01` through
`probe-utils.cjs`, extract/execute actual base methods and reproduce the old
failures even after fixes. The query probe compares the actual base controller
with the current native middleware/policy/CSRF/router. The endpoint baseline probe also executes the actual base OIDC callback and verifies that missing endpoint metadata clears the prior logout fact. These are method/protocol
probes with explicit persistence/page-data fixtures; they are not a claim that a
full baseline Sails server was launched. The permanent tests exercise the corrected
tree and retain the negative-control distinctions described above.

## R11 re-review, general review and disposition

R11 stale progress grants remain fenced after fetch, JSON, transport close,
retry and explicit close. R11 startup rollback still separates application
quiescence from an actual host stop without reintroducing the startup/stop join
cycle. The independent Standards check passed 97 targeted cases; the independent
Spec check passed 47 host/client cases on Node 26.11.1. These overlapping focused
checks do not replace full final-tree qualification.

R11 hydrated provider selection and successful AAF provisioning context are
correct. **No R11 fix was wrong or reverted.** R12-03 covers the rejected-callback
sibling that R11 did not cover. The full authentication matrix preserves R11's
six controls and extends them through actual provider installation and error-page
context.

The independent Standards pass found R12-04 and no additional material standards
violation. The Spec pass independently reproduced R12-01/02/03. The primary table found R12-05 while completing the missing-provider-endpoint logout cell; it is counted separately because its Accounts boundary requires an independent correction from R12-01. Their bounded
fresh sweeps also covered lifecycle/drain, extension ownership/replacement,
configuration precedence/redaction, assets/routes, record/form/attachment/access
boundaries, progress authorization and races, Agenda queue extraction, standalone
maintenance and production integration bindings. No further concrete class-A
P1/P2 was verified. This is a bounded code/protocol review, not proof that every
possible fault has been eliminated.

P3: no additional product defect confirmed. No backlog addition; B-01–B-06 remain
unchanged and no severe ordinary-user access-control exception was invoked.
SR-005/045/049/055 remain unchecked solely because no representative institution
is designated.

Rejected fixture/driver attempts are retained separately from accepted gates.
The first configuration table had 16 genuine schema failures plus one incorrect
assertion pattern around the expected missing-AAF-key error; the helper/error
assertion was corrected. Early DB rows used an undefined optional identifier,
which the plain-JSON persistence boundary correctly rejected; the field is now
omitted. Their teardown also initially requested a nonexistent fixture default
after removing auth and was changed to explicit repository removal/bootstrap.
Inactive OIDC begin legitimately saves an anonymous context cookie, so its test
asserts absence of an authenticated actor rather than absence of every cookie.
An initial missing-endpoint test invocation used the wrong working directory;
another overlapped the still-finishing edit and ran the old source. Neither is
an accepted gate. The final 136-case auth run passed after edits completed. The
stopped `e487ce22c` clean-build prefix supplies no accepted qualification; every
full gate uses `8318976b6`. No product change was inferred from these harness
errors. The independent reviewers likewise retain their explicitly rejected
probe drafts/fault-injection observations without counting them as defects.


## Final-tree qualification

Every final gate passed on runtime/test input
`8318976b6560802afa761b980e539adbff6512ad`. The stopped `e487ce22c` clean-build
prefix supplies no accepted gate. No host restart occurred during accepted
qualification: clean-build and closing boot IDs both equal
`3ba9700e-fa48-43eb-8996-88d76c6255b7`.

| Gate | Accepted final result |
|---|---|
| Clean install / full build / pages | Literal pinned `npm ci --ignore-scripts --strict-peer-deps`, complete backend/22 Angular apps/Webpack `npm run compile:all`, and `npm run package:pages` passed; Webpack reports nine advisory warnings. |
| Package builds / types / configuration | All five package builds, six container typechecks, six host typechecks, root typecheck, generated Prisma and portal-configuration checks passed. |
| Core default | **4,907 passed**, 7 existing pending, including final authentication/binding controls. |
| Core real-service | **224 passed**, then natural process exit after an idle interval, without instrumentation or forced exit. Includes persisted authentication/configuration and query-only translation controls. |
| Root | **422 passed**, 10 existing pending; closing resources, operations, pools and Prisma clients all zero. |
| Storage / dev-tools / PDF unit | **306 / 53 / 79 passed**. |
| Full Playwright / harness | **124 passed in 7.4 minutes**, one worker, zero retries; **19 harness checks passed**. |
| Dedicated retirement browser | **4 passed in 18.6 seconds**, including real Keycloak, shipped progress subscriptions/reconnect/delivery, actual multipart/tus/Companion bytes, PDF, durable completion and stop retry. Closing pools, Prisma clients and upgrade listeners: zero. |
| Production / generated institution | **1 / 1 passed**, including persisted work, restart and drain. |
| Persisted extension qualifiers | **5 passed**. |
| Companion lifecycle / uploads | **2 / 6 passed**. |
| General Bruno | **309/309 requests, 554/554 tests, 3/3 assertions**. |
| OIDC / S3 / PDF Bruno | **13 requests / 17 tests; 7 / 12; 4 / 10**, all passed. |
| Packed standalone maintenance | **10 commands across 102 scopes**, including 3 Agenda scopes, online install, offline `npm ci`, workflow maintenance, replacements and Mongo-bound built-ins with SQS selected by default. Pending/failures/pools: zero; explicit backfill changes one entry, then zero. |
| Lint / documentation | **937 files**, zero lint warnings/errors; API reference, generation, audit and all **4 documentation tests** passed. 43 published surfaces; 524 advisory findings. |
| Retirement closure | **14 tooling regressions passed**; **1,101 source / 6,169 installed-tree files** checked with zero executable/dependency violations; **1,261/1,261** baseline inventory files reconciled. |
| Exact pins / lock roots | **23 manifests, 377 declarations, 20 allowed local references and six lock roots** checked; zero violations. No dependency changes. |

Every accepted JUnit suite has zero failures, errors and skips. Existing Mocha
pending tests are reported separately above. Closing builder and clean-source
audits each match **all 1,336** selected authored runtime/test/configuration inputs;
**all 48** changed root assets/views/TypeScript/entrypoints match. Raw and compiled
progress helpers are byte-identical, SHA-256
`b022a576a2868de83d1715794fd4567f1a1702212f15d1ebc94270583fec6dc4`.
Both runtime matcher consumers and the actual clean-source installation use the
verified pinned `path-to-regexp@8.4.2` bytes.

Qualification uses Node **26.11.1**, npm **11.20.0** and MongoDB **9.0.4**.
Existing historical toolchain/native images with current compiled overlays were
reused; no replacement immutable-image or topology-matrix qualification is
claimed. The scratch Keycloak import includes the actual dedicated browser
callback `http://127.0.0.1:1500/portal/user/login_oidc`; this fixture adjustment
does not change repository runtime/test inputs. Full stage records, input
revisions, suite counts, review dispositions and retained local evidence hashes
are recorded in [qualification.json](final-review-r12/qualification.json).

Cleanup removed all seven main/compile containers, all Compose profile
containers, all captured anonymous volumes and all round-labelled Compose
volumes, the owned profile network, all three firewall rules and all round hosts
aliases. Remaining owned containers, networks, volumes and firewall rules:
**zero**. The restored isolated dockerd/containerd were stopped, and their
temporary `/run/sr-p7-isolated` directory and namespace reference removed.
The host's pre-existing Docker service and durable isolated engine images/data
are preserved. No image was built or new dangling image created; pre-existing
dangling image `9bf944d09e37` remains untouched.

Round compiled overlays and browser library copies were removed after final
audits. No artifact/cache relocation or temporary artifact bind/backing directory
was used. Bruno-generated environment and lock changes are archived, and both
tracked files are restored byte for byte. Diagnostic logs remain locally in
`.tmp/sails-retirement/final-review-r12/`. The collector accepted every stage,
suite output, input revision, closing audit and cleanup witness; all **276 local
evidence hashes** and **six portable probe hashes** were verified against the
actual files.

This evidence-only commit follows the tested runtime commit. No application code,
test or dependency change follows the accepted final qualification.
