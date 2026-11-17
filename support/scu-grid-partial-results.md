# Data-grid partial-result verification

17 November 2026. Finding 4: generated Visual queries discarded usable collection data whenever GraphQL returned a field error. The Grid and JSON views now retain the current partial response, display safe diagnostic codes with selected labels/field IDs and response record OIDs, and distinguish failed cells from genuine null values. Internal exception messages are omitted. Top-level failures remain fatal.

## Controlled reproduction before the source fix

From `angular/`, using installed dependencies and the built common library:

```bash
CHROME_BIN=/usr/bin/chromium ./node_modules/.bin/ng test @researchdatabox/data-grids --watch=false --browsers=ChromeHeadlessNoSandbox --include=projects/researchdatabox/data-grids/src/app/record-grid.service.spec.ts
```

Result: **1 failed, 43 passed**. The supplied partial-response regression expected three usable rows and mapped `HISTORICAL_VALUE_TYPE` diagnostics. Instead, the existing service rejected with `preview-failed`, leaving the page undefined. This reproduction ran before implementation changes. An initial launch without `CHROME_BIN` could not find Chrome; the command above is the actual browser reproduction.

## Verification after the fix

From `angular/`:

```bash
CHROME_BIN=/usr/bin/chromium ./node_modules/.bin/ng test @researchdatabox/data-grids --watch=false --browsers=ChromeHeadlessNoSandbox --include=projects/researchdatabox/data-grids/src/app/record-grid.service.spec.ts --include=projects/researchdatabox/data-grids/src/app/data-grids.component.spec.ts
```

Result: **109 passed**. Coverage includes retained scalar values and nulls; generated alias-to-field mapping; nested/list error paths and nullable parents; actual response OIDs; safe diagnostic JSON; failed-cell rendering; shared diagnostics across Grid/JSON; fatal top-level errors; stale results after edits; and discarded out-of-order partial responses. `git diff --check` passed. Karma required escalated local server binding. Existing AG Grid CSS-variable warnings did not fail the tests.

## Scope and limits

These are controlled Angular HTTP/component regressions, informed by the private audit. This delegate used controlled tests; the parent subsequently verified the integrated local synthetic browser harness, as recorded in the overall ledger. The initial fix covers generated Visual collection queries and their Grid/JSON views; the appendix describes the subsequent free-form response API. Legacy `raw` callers retain strict error behavior. A malformed collection, invalid identity, or invalid pagination response remains fatal. Backend contracts, schema availability, and catalogue fingerprinting are separate work.

Raw audit evidence and test output remain private and are not included here. No commits or dependency changes were made by this implementation task.

## Appendix: unlinked and free-form GraphQL partial results

The subsequent raw-query implementation extends finding 4 to unlinked/free-form queries. `DataGridSource.rawResponse` is an additive optional boundary returning explicit `{ data, errors?: GridFieldError[] }`. The component prefers it and falls back to `raw` for older sources. Existing `raw` consumers retain plain-data results and strict error behavior. GraphQL data receives no hidden properties or symbols.

The response API preserves usable data and emits only safe codes and response paths. The Grid maps generated aliases through the current scope's field selections, including nested/list paths and nullable parents. Arbitrary aliases remain identifiable by their complete response path. Row OIDs are attached only when the existing query identity check establishes a real record OID. Failed cells display diagnostics separately from genuine nulls; an unmappable shape retains its complete JSON response. Transport/root failures, request bytes, Grid row/column/depth limits, pagination checks, stale edits and request-sequence guards remain enforced. The parent's scoped schema API and UI changes are retained.

### Controlled before test

From `angular/`, with Karma local server binding escalated:

```bash
CHROME_BIN=/usr/bin/chromium ./node_modules/.bin/ng test @researchdatabox/data-grids --watch=false --browsers=ChromeHeadlessNoSandbox --include=projects/researchdatabox/data-grids/src/app/record-grid.service.spec.ts
```

Result before implementing the response API: **1 failed, 49 passed**. The regression submitted three rows under the free-form `plans` alias, with a nested `HISTORICAL_VALUE_TYPE` error affecting one null cell. The existing raw execution rejected with `preview-failed` and returned no data. The final regression prefers the new response API and retains the original raw fallback; a separate compatibility assertion verifies that legacy `raw` remains strict.

### After verification

From `angular/`, with the same local server escalation:

```bash
CHROME_BIN=/usr/bin/chromium ./node_modules/.bin/ng test @researchdatabox/data-grids --watch=false --browsers=ChromeHeadlessNoSandbox --include=projects/researchdatabox/data-grids/src/app/record-grid.service.spec.ts --include=projects/researchdatabox/data-grids/src/app/data-grids.component.spec.ts
```

Final result: **122 passed**. `git diff --check` passed. Existing AG Grid CSS-variable warnings did not fail the run. Coverage adds explicit safe response envelopes, legacy API compatibility, generated and arbitrary alias diagnostics, response OIDs, retained valid rows and JSON, failed versus genuine null cells, nested/list errors, nullable parents, unmappable JSON, malformed/top-level errors, transport failures, request-size bounds, stale edits and discarded old raw responses. This delegate used controlled tests; the parent subsequently verified the integrated local synthetic browser harness, as recorded in the overall ledger. No dependencies, commits or PRs were created.

## Final integration verification

The complete integrated data-grid suite passed **200 tests** after the parent combined partial-result handling with scoped schemas, configured defaults and verified scalar-list capabilities. A subsequent Codex Hub review found and prompted a mixed-root schema regression: one failing/11 passing before correction. Schema scoping now requires all record selections to agree on one known type; mixed/unknown selections retain the bounded global schema behavior. Full backend GraphQL suite: **172 passing, one existing pending**. See [the overall ledger](scu-grid/README.md) for authenticated local browser probes and the branch stack.
