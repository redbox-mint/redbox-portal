# Inherited defects retained for separate follow-up

Round 5 applies the feature gate to `a49366803..39ad5813c`. These three P2
items remain unchanged in behavior from the pre-retirement path. None is an
unauthenticated or cross-tenant access/privilege-escalation exception. Already
fixed R1–R4 defects are not duplicated here. Locations refer to round 5's source.

The executable [service-port probes](final-review-r5/inherited-probes.cjs) run
against the rebuilt packages in the Node 26 test container:

```sh
node support/specs/sails-retirement/evidence/final-review-r5/inherited-probes.cjs
```

These are deterministic port interleavings and error observations, not claims
that a real-Mongo or public HTTP exploit was executed. The two extension helpers
below have no selected production caller; R3's enumeration already identified
them. Production authentication uses the awaited Accounts methods instead.

## B-01 — P2: concurrent same-brand role replacements can merge requested sets

**Location:** `packages/redbox-core/src/identity/Users.ts:1352` and
`packages/redbox-core/src/persistence/identity/PrismaIdentityRepositories.ts:194`.

**Reproduction:** pause replacement A after its membership deletion, complete
replacement B with only `member`, then release A's insertion of only `admin`.
The actual Users method leaves both roles. The probe reproduces this for scoped
and unscoped calls. Admin authorization is required by the HTTP entrance; this
is not a normal user's means of acquiring privileges. R4 correctly protects
foreign-brand changes but does not promise serialized edits within one brand.

**Inheritance:** base `PrismaIdentityRepositories.ts:194–222` already implements
replacement as `remove` followed by per-edge `add`; base
`services/UsersService.ts` uses that replacement. Its comment expressly preserves
Waterline's delete-before-insert partial failure. Same-brand concurrency and
partial insertion failures are consequently older behavior, not a fault
introduced by R4's narrower deletion predicate.

**Suggested fix:** design an atomic/versioned membership replacement or durable
per-user serialization that works across processes; return a conflict for a
stale replacement. Preserve foreign-brand edges and qualify real concurrent
writes and injected insert failure. A process-local mutex alone is insufficient
for multiple writers.

## B-02 — P2: legacy email template helper drops completion and errors

**Location:** `packages/redbox-core/src/integrations/Email.ts:254`.

**Reproduction:** call `sendTemplate` with a successful template Observable and
a gated delivery Observable. It returns `undefined` while delivery remains
subscribed. Reject delivery: RxJS reports an unhandled error rather than a
caller-visible failure. The probe observes `config.onUnhandledError` in its
isolated process. An extension calling this helper cannot await completion or
register the returned work with its owner.

**Inheritance:** base `services/EmailService.ts:222–237` has the same nested
subscriptions and void return. R3's async appendix explicitly noted this
unselected exported helper. No selected production invocation was found in R5;
the owned record-notification path is separate and already fixed.

**Suggested fix:** replace the nested subscriptions with a returned, composed
Observable/Promise, propagate errors, and bind accepted work at actual extension
callers. Document any return-contract change; retain delivery drain/error tests.

## B-03 — P2: legacy Users post-save wrapper discards the Accounts Promise

**Location:** `packages/redbox-core/src/identity/Users.ts:788`.

**Reproduction:** supply an Accounts post-save operation whose Promise is still
gated, then call `Users.triggerPostSaveTriggers`. The wrapper immediately returns
`undefined`; its caller has no handle to await/register, and a rejected operation
has no rejection handler at this wrapper. The probe verifies the lost handle
with a resolving gate, avoiding an intentional process-level rejection.

**Inheritance:** base `services/UsersService.ts` has the same void wrapper around
`authenticationAccounts().triggerPostSaveTriggers`. R3's async appendix already
identifies it as unselected. Production Accounts create/update/login paths await
their own post-save operations and do not call this wrapper.

**Suggested fix:** return/await the Accounts Promise and require extension callers
to retain it within their admitted lifetime; add a delayed success/rejection
contract test. Do not replace the already-owned production account path.

## B-04 — P3: translation tests leak their global Fetch stub into later suites

**Location:** `packages/redbox-dev-tools/test/commands/sync-translation.test.ts:88`
and its `afterEach` at line 26.

**Reproduction:** R7's generated-route HTTP regression passes alone. In the full
dev-tools run, the earlier translation suite assigns a standalone Sinon stub to
`global.fetch`. Its teardown calls `sinon.restore()`, which does not restore that
manual assignment. A subsequent real `fetch` hits the translation stub's fallback
and throws at line 74: the full run has 52 passing / 1 failing. R7's new wire
regression uses Node's HTTP transport independently; the inherited Fetch mutation
remains unchanged.

**Inheritance:** this file has no diff from `a49366803` to the incoming
`768e1bbfe`; the baseline already assigns the callback directly and omits restoring
the original global. This is test-order contamination, with no demonstrated
production impact or access-control exception.

**Suggested fix:** preserve and restore the original Fetch function in teardown,
or install a Sinon-managed stub on the global property so `restore()` owns it.
Qualify the translation tests followed by a real Fetch request in one process.

## B-05 — P2: long unversioned asset names receive immutable year-long caching

**Location:** `packages/redbox-core/src/http/express/pageHeaders.ts:11`.

**Reproduction:** the actual immutable-asset matcher accepts
`/default/rdmp/images/checklist.png` and `/js/redbox-progress.js`, although neither
basename contains a content fingerprint. Static delivery consequently marks them
`public, max-age=31536000, immutable`. A deployment changing bytes at the same URL
can leave a browser using the older artifact for a year. The fingerprinted
`/angular/form/browser/main-ABC12345.js` is a positive control.

**Inheritance:** `a49366803:packages/redbox-core/src/config/http.config.ts:227–234`
uses the same basename expression; its middleware at lines 800–806 applies the
same immutable year-long header before its no-cache path handling. R8 extracts
and evaluates only the baseline matcher functions, comparing them with the
compiled current matcher: all three paths return true in both. This is unchanged
behavior, so no runtime correction is included in Sails retirement. No severe
ordinary-user access-control exception was demonstrated.

**Suggested fix:** distinguish a real generated content fingerprint from an
ordinary basename and retain validation/revalidation for unversioned assets.
Qualify changed bytes across two deployments and preserve immutable caching for
fingerprinted Angular bundles. The executable comparison and its observations
are retained in `final-review-r8/cache-inheritance-probe.cjs` and R8 qualification
hashes; the full baseline configuration is not copied into the evidence.

## B-06 — P2: REST user listing ignores `includeDisabled=true`

**Location:** `packages/redbox-core/src/http/express/identityLinks.ts:171`.

**Reproduction:** validate `?includeDisabled=true` through the actual REST route
contract: its extracted value is boolean `true`. The handler compares it with
string `'true'`, so a fixture containing one active and one effectively disabled
user returns only the active user and understates `summary.numFound`.

**Inheritance:** `a49366803:packages/redbox-core/src/controllers/webservice/UserManagementController.ts:187`
uses the same string comparison on the validated parameter. Executing the actual
baseline method and current handler with the same extracted request selects only
the active user in both. Round 11 independently reruns this probe under Node
26.11.1; local reproduction and output are retained under
`.tmp/sails-retirement/final-review-r11/standards/include-disabled-probe.cjs` and
`inherited-disabled-verified.log`, with hashes in the qualification manifest.
This is unchanged administrator-facing listing behavior; no severe access-control
exception was demonstrated.

**Suggested fix:** consume the validated boolean directly and cover both query
values through real HTTP, including returned users and summary counts. Preserve
requested-brand scoping and the default exclusion of disabled users.

## B-07 — P3: configuration declarations omit five accepted baseline shapes

**Locations and inheritance:** the source-derived R13 table checks each declaration
at `a49366803164429f9d8bdd249dadcdf856c9d13e` and in the current source. Both omit:

| Accepted shape | Inherited declaration location |
| --- | --- |
| AAF `loginUrl` | `packages/redbox-core/src/config/brandingConfigurationDefaults.config.ts:26`, `BrandAuthAafConfig` |
| OIDC `claimMappingOptions` | Same file, line 35, `BrandAuthOidcConfig` |
| Solr transform `jsonString` | `packages/redbox-core/src/config/solr.config.ts:56`, `SolrPreIndexConfig` |
| i18n `defaultNS` | `packages/redbox-core/src/config/i18n.config.ts:16`, `I18nNextInitConfig` |
| Reusable form placeholders | `packages/sails-ng-common/src/config/dictionary.outline.ts:209`, `ReusableFormDefinitions` and its component-frame union |

**Reproduction:** all 195 retained literal configuration fixtures pass the actual
v6 loader and AJV validation. Compiling those same literal values against the
public configuration type produces ten inherited diagnostics across nine fixtures
in these five categories. This is one grouped typing backlog item with five
subcases; these are not runtime input rejections or additional incoming P2 defects.
The generated table retains each value and marks only the exact inherited
diagnostic with `@ts-expect-error`; no cast or runtime exclusion hides the input.

**Evidence:** `final-review-r13/configuration-acceptance.json` retains baseline
declaration text, line provenance, exact diagnostics and fixture indices in
`typingBacklog` and `typingDiagnostics`. Its generator verifies the omissions in
both source versions and rejects unexpected compiler failures.

**Suggested fix:** align the original declarations with the existing runtime
contracts and retain the full literal table as the regression. No runtime change
or access-control exception is warranted in this retirement review.

## B-08 — P2: configured native index TTL and hidden options are dropped

**Location:** `packages/sails-hook-redbox-storage-mongo/src/persistence/preflight.ts:105`,
`storageIndexes`.

**Reproduction:** execute the actual baseline and current descriptor builders with
`{ key: { expires: 1 }, name: 'institution-expiry', expireAfterSeconds: 60,
hidden: true, sparse: true }`. Both emit datastore/collection/name/keys/sparse
without the TTL or hidden options. Configured expiration therefore cannot reach
the index creation descriptor. This is an extracted-method probe, not a claim
that a MongoDB TTL expiry was observed.

**Inheritance:** the baseline builder at
`a49366803:packages/sails-hook-redbox-storage-mongo/src/persistence/preflight.ts:97`
has the same option allowlist. R13 correctly restored acceptance of native
descriptor shapes; it did not introduce this consumer omission. There is no
ordinary-user access-control exception. Reproduction and provenance are in
`final-review-r14/entrypoints-probes.cjs`, `entrypoints-probe-results.json` and
`entrypoints-differential.json`.

**Suggested fix:** preserve supported native options through the common index
descriptor, inspection and ensure comparison; qualify actual creation, TTL and
existing-index conflicts separately.

## B-09 — P2: vocabulary administration listing ignores the requested brand

**Location:** `packages/redbox-core/src/vocabulary/Vocabulary.ts:252`, `list`.

**Reproduction:** request `branding: 'brand-1'` from the actual service method
with repository ports containing one local and one foreign vocabulary. Both
count/list predicates omit branding and both rows are returned. The explicit
comment treats this administration feature as single-tenant. The deterministic
port probe is retained in `final-review-r14/identity-inherited.cjs`; no public HTTP
or real database exploit is claimed.

**Inheritance:** `a49366803:packages/redbox-core/src/services/VocabularyService.ts`
contains the same method/comment/predicate. The native administration entrance
requires a brand Admin; ordinary signed-in users cannot reach this list. No severe
ordinary-user access-control exception applies, so runtime behavior remains
unchanged in this review.

**Suggested fix:** use a normalized requested-brand predicate in count and list,
retain total/pagination consistency, and cover mixed-brand administrator fixtures
through HTTP and persistence.
