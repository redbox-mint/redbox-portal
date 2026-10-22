# P0 current behavior and acceptance fixtures

Production baseline: `f6668358d148e09f77fd335bd9941ddaa9dbe949`.
P0 changes only tests and evidence. Results and exact commands are in
[p0-validation.md](p0-validation.md); follow-ups are in
[p0-deferred-behavior.md](p0-deferred-behavior.md).

## CacheService

`packages/redbox-core/test/services/CacheServiceCharacterization.test.ts` adds
11 tests against the actual service, real NodeCache and callback query doubles.
It does not replace getObservable or merely recalculate the expiry expression.

- `get()` returns an RxJS Observable. Truthy memory hits avoid Waterline;
  `false`, `0`, empty string and null memory entries each cause another persisted
  lookup. A persisted false/zero/empty string keeps that public value. Missing
  row, missing data and null data return null. Read errors reach the subscriber.
- The memory value is captured when get() is called (`of(cache.get(name))`);
  persistence lookup occurs through the subscription. Preserve this timing when
  changing the boundary. This timing observation is source inspection, not a
  separate new test.
- Persisted expiry uses `floor(DateTime.local().toSeconds()) - ts_added >
  custom_cache.cacheExpiry`. At the exact boundary it still returns data;
  one second older returns null without deleting or rewriting the row. Core's
  default expiry is 31,536,000 seconds; focused tests deliberately use 60.
- A database hit resets the local TTL to the full configured default rather
  than the remaining persisted lifetime. `set(name, value, ttl)`'s TTL applies
  only to memory: the database write contains name/data/epoch-second ts_added.
- `set()` writes memory first and returns void while find/create callbacks are
  still pending. The test withholds each callback to distinguish local completion
  from durable completion. Existing rows use update by name; absent rows create.
  There is no upsert, serialization, retry or durability acknowledgement.
- Find/create/update errors are logged as two error calls (the entry-name
  message, then the error); the local value remains available. Concurrent
  find/create can race. P0 verifies actual unique enforcement separately, but
  does not claim a concurrent CacheService workload was tested.
- Null with expiry zero remains a null local entry with no expiry initially.
  The next get takes the falsy persisted path; a DB null hit then gets the normal
  local default TTL. It is a reset value, not a persisted delete command.

The existing CacheService suite also ran. Some older tests check expressions
or stubs instead of invoking the service's full chain; the new tests supply the
missing behavior evidence. Cross-process restart/durability, mixed adapters and
actual database outage behavior remain P5, not evidence established here.

## Integration notifications

The existing `test/services/IntegrationNotificationService.test.ts` ran with
the focused suite. It covers failure delivery, status/config gating, brand-ID
configuration resolution, recovery, suppression, persisted-window expiry,
unknown/failing channels and logging. Assertions at the source baseline include:

- Lines 410-435: a delivered failure writes an object with failedAt/expiresAt
  strings and a positive time interval. Source uses toISOString(), not BSON dates.
- Lines 438-469: expired persisted throttle state causes `set(key, null, 0)`
  before renewed failure delivery/state. Active state suppresses a repeat.
- Lines 191-229 and 497-534: recovery with prior state sends the recovery template
  and writes `null, 0`. No prior failure skips recovery. Source resets after the
  delivery attempt even if it is unsuccessful; do not turn reset into delete.
- The key uses the incoming brandId or literal `none`, record OID and lowercased
  integration name. Config can resolve a default brand ID without changing that
  key. Legacy non-object non-null throttle state is treated as active; malformed
  plain objects without date fields also remain active (source characterization).

These tests stub CacheService at the notification seam. The new cache tests
exercise the null/zero-TTL path in CacheService itself; real notification restart
and delivery against persisted state are not claimed in P0.

## Branding previews

`test/services/BrandingPreviewCharacterization.test.ts` adds five tests against
the real fetchPreview method. Existing BrandingServiceLifecycle and
BrandingFontDelivery tests cover draft and retained-version creation, revision
conflicts, history scoping and controller paths.

- Draft preview requires an exact draft revision and a publishable typeface.
  It awaits create of `branding-preview:<32 hex token>` with css, branding,
  portal, hash and revision. Retained-version preview loads history by brand ID,
  rejects another brand's/missing version with `history-not-found`, regenerates
  CSS and awaits create with versionId. Both use integer epoch-second ts_added
  and return a scoped preview URL. They do not mutate the draft/publication.
- fetchPreview looks up by token name, uses its own TTL (default 300 seconds;
  configuration via lodash get even though the typed branding config currently
  omits this property), and accepts age exactly equal to TTL. Missing row throws
  `preview-not-found`. An older row is deleted by ID before `preview-expired`.
- A valid row is deleted by ID and the deletion must finish before data returns.
  A deletion failure rejects, including in the expired branch; it takes
  precedence over `preview-expired`. A missing deletion is otherwise a no-op.
- Read/delete is non-atomic. Two requests that both observe the row can both
  return its CSS. The new double reproduces that interleaving. Do not describe
  this as an atomic single-use consume, despite the existing source comment.
- Creation/history selection is brand-scoped. Fetch itself accepts only a token,
  returns the stored branding/portal and does not compare URL branding with
  stored branding. `BrandingController.renderPreview` likewise uses the token.
  The pilot must not invent a stronger scoping promise.
- The preview controller rejects a missing token with 404, an invalid token
  format with 400, and maps fetch errors to `404 /* preview not found */`.
  A valid fetch sets CSS content type, no-cache/no-store and a weak preview ETag;
  deletion already occurred before a matching ETag produces 304. These response
  details are inspected source behavior; no new HTTP/browser run is implied.

## Real raw MongoDB fixture

Archive: `packages/redbox-core/test/fixtures/cache-persistence/waterline-mongo8.ejson`.
Runner and provenance are documented in that directory's README. The test loads
the actual model/default config through a minimal Sails ORM application, so Sails
normalization (including unique metadata) executes. A standalone Waterline
attempt rejected the unnormalized unique property; it was replaced with the
proper Sails path, not with a hand-written imitation model.

The fixture contains 14 synthetic documents: object, array, string, empty string,
fractional number, zero, true, false, null, omitted-on-create, notification-shaped
state, branding-preview-shaped state, native-inserted legacy-missing and
native-inserted legacy-BSON. The notification/preview rows use representative
payload shapes through the real model, not actual dispatch or preview generation.
It captures a before-update
snapshot, after-update documents, automatic timestamp strings, server-side $type
results, indexes before/after explicit creation, and the duplicate error category.

Observed on standalone MongoDB 8.0.34:

- Physical collection `cacheentry`; `_id` is BSON ObjectId, public ID its hex
  string. Find and deletion by that string ID work. No BSON Date is introduced
  for createdAt or updatedAt: both are ISO strings with milliseconds and Z.
- ts_added is numeric epoch seconds (BSON int for this epoch), not milliseconds
  or a BSON Date. Fractional data is BSON double, zero integer; JSON variants
  round trip. Server $type assertions avoid inferring BSON types from a JS number.
- Waterline omitted data on create becomes physical null. A truly missing data
  field can exist in a native/legacy row; Waterline leaves it absent on read.
  Native reads also leave missing automatic timestamps absent. Do not fill in
  timestamps or rewrite legacy rows merely to make an ORM contract happy.
- Waterline update preserves createdAt, advances/retains an ISO updatedAt,
  updates ts_added/data and preserves an unrelated legacy field. Updating a
  missing name returns an empty array; deleting a missing ID succeeds.
- Fresh safe-mode startup establishes only `_id_`; declared unique name is not
  sufficient. Two same-name writes succeeded before explicit test cleanup and
  creation of `{name: 1}`, `unique: true`, named `p0_name_unique`. Afterwards a
  duplicate via Waterline produced `E_UNIQUE`. No collection collation was set;
  the test index uses the default simple comparison. This is not an audit of an
  institution's existing indexes, collation, sparse or partial definitions.
- The synthetic native legacy row deliberately contains Date, Binary and
  ObjectId data. It demonstrates what must be reported/migrated explicitly in
  future compatibility checks; it does not prove Waterline created those values,
  or that a real institution contains them. No automatic coercion was performed.

## Compatibility checklist handed to P1

- [x] Inspect existing collection/ID/timestamp/null/missing representations on real MongoDB.
- [x] Record safe-mode index absence and actual unique enforcement/error separately.
- [x] Freeze service/notification/preview quirks and separately list proposed fixes.
- [ ] Map the exact Prisma contract to ObjectId/string IDs and string timestamps.
- [ ] Prove both adapter directions, omission/null writes and legacy-field preservation.
- [ ] Test unsupported BSON without coercing/replacing documents.
- [ ] Prove timestamp automation, missing update/delete behavior and duplicate errors through Prisma.
- [ ] Prove CommonJS/NodeNext, generated artifact packaging and supported Node/topology matrix.
- [ ] Test the designated previous development release against Prisma-written data.

The unchecked items are later-phase work, not P0 blockers or completed claims.
