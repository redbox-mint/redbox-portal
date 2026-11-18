# Mongo collection implementation review

Reviewed `af6a02429813df42957328374e89627501c05b38` in the existing
`t3/graphql-mongo-collections` implementation checkout. The review found three
correctness gaps, addressed in the follow-up commit containing this report.

## 1. Conditional and workflow date hints

Confirmed: the prior `nodeHints` accumulated `dateTime = true` from either branch.
A conditional date-time string/plain-string field therefore advertised DATETIME,
including range filters, despite the other branch allowing arbitrary text. An
isolated execution of the original catalogue source reproduced
`DATETIME/filterable=true/sortable=true`; the same fixture now produces
`MIXED/filterable=false/sortable=false`.

`record-graphql/catalogue.ts:88` now accumulates scalar meanings instead of an
OR-ed date flag. Conflicting branches, including nested object branches, become
MIXED. Matching date declarations remain queryable. Workflow variants also compare
calendar-date versus instant meanings, in addition to their existing scalar-type
comparison. Narrowing to a consistent workflow restores date capabilities.

There was a second route to the same loss of information: the read compiler
merges duplicate UI declarations using `mergeReadNodes`. In
`record-contract/read-visibility.ts:51`, conflicting date formats now remove the
single format annotation and retain `x-redbox-format-conflict: true`. That marker
survives subsequent merges and is honored by the catalogue. The underlying
nullable string contract remains available to ordinary metadata reads.

`test/unit/record-graphql/catalogue-dates.test.ts` exercises both branch orders,
date/text, date/number, calendar-date/instant, nested branches, workflow scoping,
matching declarations, compiler merges and rendered contract annotations.

## 2. ACL parity and supported persisted forms

Confirmed: the prior Mongo predicate intersected persisted role grants with string
names and discarded owned IDs unless their runtime type was string. In contrast,
`reporting/authorization.ts:19` resolves each role grant through `String(value)`
and compares owned/canonical IDs through `String(id)`; `RecordsService.ts:7897`
uses that helper and `RolesService.getRole`.

`record-graphql/mongo.ts:143` now stringifies non-null owned IDs. Role grant values
are derived from canonical owned role names: a numeric/boolean value is admitted
only when its JavaScript string representation is exactly that canonical name.
This preserves names such as `01` and `1e+21` without depending on Mongo's numeric
string formatting. User grants still compare exact strings; canonical duplicate
role names still resolve to the first registered role. Admin/Guest receive no
implicit bypass. Nested authorization still shadows legacy grants, including an
empty object or array; absent or primitive authorization uses legacy flat keys.

The new real-Mongo regression in `RecordGraphqlGrid.test.ts` derives its expected
IDs from `RecordsService.hasViewAccess` over the stored documents, then asserts
both returned IDs and the exact set hydrated by GraphQL. It covers scalar and
array role grants, numeric/fractional/exponent/boolean names, legacy scalar grants,
numeric and ObjectId owned IDs, canonical duplicate names and denied cases.

Malformed objects, nested arrays and BSON Decimal128 grants remain excluded.
The wiki now states the supported JSON scalar boundary and exclusions, including
null elements, non-finite numbers, unsafe BSON integers and missing/null owned IDs.
Incidental JavaScript coercions of malformed grants do not expand collection ACLs.

## 3. Angular date persistence and contract accuracy

The Angular model's `dateOnly` getter reads `fieldConfig.config.dateOnly`, not
component display configuration (`date-input.component.ts:291`). Its calendar
normalizer produces ISO calendar-date strings (`:207`); its default model uses
JavaScript Date values (`:295`, `:301`). The form submits its model values
(`form.component.ts:1116`) through Angular HttpClient
(`portal-ng-common/src/lib/record.service.ts:901`, `:919`), which serializes Dates
as ISO timestamps. Component `dateFormat` and `enableTimePicker` are configured
separately (`date-input.component.ts:460`); a disabled time picker does not turn
an instant model into a calendar-date model.

Confirmed: the contributor previously advertised date-time for both modes.
`record-contract/core-contributors.ts:476` now emits `x-redbox-format: date` only
for `model.config.dateOnly === true`, and `date-time` otherwise. Both retain the
nullable string schema. Backend compiler/rendering regressions verify the exact
annotations with a non-ISO display format and enabled time picker. Mongo's date
normalizer is unchanged; its existing real-Mongo assertions cover calendar dates,
ISO timestamps, offsets, BSON dates and legacy local timestamps.

## 4. Removed Solr symbols and consumers

A tracked-file audit found no executable source/config/test references to
`getRecordQuerySchema`, `searchRecordPage`, `SOLR_RECORD_GRID_FIELDS`, the deleted
`index-bindings` helper, or `recordGraphqlFields`. Remaining references are:

- Migration/removal instructions in `Record-GraphQL-Grids.md:63` and
  `Configuring-Solr.md:209`.
- Archived patch text, already explicitly marked historical and not to be
  reapplied in `data-grids/backend-patches/README.md:3`.
- The prior implementation report's changed-file manifest (the helper was deleted).

No consumer fix was needed. Active wiring remains
`StorageService.ts:69` → `RecordGraphqlService.ts:90` →
`MongoStorageService.ts:1009`, using `executeRecordCollection`.

## Follow-up verification

- Core TypeScript build: passed.
- GraphQL package typecheck and tests: **115 passing**.
- Contract compiler tests: **27 passing**.
- Oxlint on the four changed source files: **0 warnings, 0 errors**.
- Real-Mongo grid integration suite: **25 passing (2 minutes), exit code 0**.
  Ran only `test/integration/services/RecordGraphqlGrid.test.ts` plus the required
  bootstrap using the committed Compose mount profile, in isolated project
  `redbox-graphql-mongo-review`. Its containers/network were removed afterward.
- Prettier on changed TypeScript files and `git diff --check`: passed.

Local evidence logs are `/tmp/graphql-mongo-review-baseline.log`,
`/tmp/graphql-mongo-review-unit.log`, `/tmp/graphql-mongo-review-contract.log`,
`/tmp/graphql-mongo-review-build.log`, `/tmp/graphql-mongo-review-docker.log`
and `/tmp/graphql-mongo-review-symbols.log`.

The first Docker run passed the existing 24 tests but the new test stopped while
creating a BSON fixture from the root driver's incompatible BSON version. The
fixture now uses Sails' pinned driver constructors; the fresh final run above
passed all 25 tests. That initial log is
`/tmp/graphql-mongo-review-docker-fixture-failure.log`. No production code changed
between the two Docker runs. Runner-generated integration config shims were
restored before committing.

No Angular source or Mongo date-normalization behavior changed. Unrelated saved
query/report/promotion suites and the storage-hook package suite were not rerun;
their prior results remain recorded in `mongo-collections-implementation.md`.
