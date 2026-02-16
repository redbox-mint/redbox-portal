# Vocabulary Bootstrap Data Loading

Load vocabulary data from JSON files and trigger RVA imports during application bootstrap.

## Proposed Changes

### Bootstrap Data Directory

#### [NEW] [support/resources/development/bootstrap-data/vocabularies/](support/resources/development/bootstrap-data/vocabularies/)

Two kinds of files:

| File type                            | Purpose                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `*.json` (except `rva-imports.json`) | Local vocabulary loaded via `VocabularyService.create()`                  |
| `rva-imports.json`                   | RVA vocabulary IDs to import via `RvaImportService.importRvaVocabulary()` |

#### Local Vocabulary JSON Schema

Required fields: `name`, `slug`. Optional: `description`, `type` (default `flat`), `entries[]`.

Branding is **always** resolved to the default brand — a `branding` field in the JSON is ignored.

Unknown top-level fields are silently ignored (forward compatibility).

```jsonc
{
  "name": "ANZSRC Type of Activity", // required
  "slug": "anzsrc-toa", // required — uniqueness key
  "description": "...", // optional
  "type": "flat", // optional, "flat" | "tree", default "flat"
  "entries": [
    // optional
    {
      "label": "Pure basic research", // required per entry
      "value": "pure", // required per entry
      "identifier": "...", // optional
      "order": 0, // optional, default positional index
      "historical": false, // optional, default false
    },
  ],
}
```

For `type: "tree"`, entries may include `children: [...]` arrays (same shape, recursive).

Duplicate entries within a file are caught by the existing `VocabularyEntry` unique indexes and will cause the file to fail (logged, other files continue).

#### RVA Imports JSON Schema

```jsonc
{
  "imports": [
    { "rvaId": "316" }, // required
    { "rvaId": "317", "versionId": "72" }, // versionId optional
  ],
}
```

#### [NEW] [anzsrc-toa.json](support/resources/development/bootstrap-data/vocabularies/anzsrc-toa.json)

```json
{
  "name": "ANZSRC Type of Activity",
  "slug": "anzsrc-toa",
  "description": "ANZSRC Type of Activity classification",
  "type": "flat",
  "entries": [
    { "label": "Pure basic research", "value": "pure", "order": 0 },
    { "label": "Strategic basic research", "value": "strategic", "order": 1 },
    { "label": "Applied research", "value": "applied", "order": 2 },
    { "label": "Experimental development", "value": "experimental", "order": 3 }
  ]
}
```

#### [NEW] [rva-imports.json](support/resources/development/bootstrap-data/vocabularies/rva-imports.json)

```json
{
  "imports": [{ "rvaId": "316" }, { "rvaId": "317" }]
}
```

---

### VocabularyService

#### [MODIFY] [VocabularyService.ts](packages/redbox-core-types/src/services/VocabularyService.ts)

Add `bootstrapData()` method and `'bootstrapData'` to `_exportedMethods`.

**Path resolution**: The vocabulary directory is resolved from `sails.config.bootstrap.bootstrapDataPath` (default `bootstrap-data`) with `/vocabularies` appended.

If the directory does not exist, the method returns immediately with a verbose log — no error.

**Processing order**: Files are sorted alphabetically by filename before processing, ensuring deterministic order across OS/filesystem differences.

**Algorithm per local vocab file**:

1. Parse JSON — on failure, `sails.log.error` with filename and error, continue
2. Validate `name` and `slug` are non-empty strings — on failure, log error, continue
3. Resolve branding to default brand via `sails.services.brandingservice.getDefault()`
4. `Vocabulary.findOne({ slug, branding })` — if found, `sails.log.verbose('Skipping ...')`, continue
5. Call `this.create({ ...data, branding })` — on failure, log error, continue
6. On success, `sails.log.verbose('Created vocabulary ...')`

**Algorithm for `rva-imports.json`**:

1. Gated by `sails.config.vocab.bootstrapRvaImports !== false` (defaults to enabled)
2. For each entry, `Vocabulary.findOne({ rvaSourceKey: 'rva:<rvaId>' })` — skip if found
3. Call `RvaImportService.importRvaVocabulary(rvaId, versionId?, defaultBranding)` with a 30s timeout per import
4. On timeout or error: `sails.log.error(...)`, continue to next entry — **never fails the lift**

---

### Bootstrap Hook

#### [MODIFY] [bootstrap.ts](packages/redbox-core-types/src/bootstrap.ts)

Call after the existing vocab bootstrap (line 80):

```diff
     await lastValueFrom(sails.services.vocabservice.bootstrap() as Observable<unknown>);
     sails.log.verbose("Vocab service, bootstrapped.");
+
+    await sails.services.vocabularyservice.bootstrapData();
+    sails.log.verbose("Vocabulary bootstrap data, loaded.");
```

---

## Verification Plan

### Unit Tests

#### [MODIFY] [VocabularyService.test.ts](packages/redbox-core-types/test/services/VocabularyService.test.ts)

Add `describe('bootstrapData')` block with stubbed `fs`, `Vocabulary`, and `RvaImportService`:

| Test case                             | Assertion                                                 |
| ------------------------------------- | --------------------------------------------------------- |
| Directory missing                     | No errors, no creates                                     |
| Valid local JSON, vocab doesn't exist | `create()` called with correct payload + default branding |
| Valid local JSON, vocab exists        | `create()` not called                                     |
| Malformed JSON                        | `sails.log.error` called, other files still processed     |
| Missing `name` or `slug`              | `sails.log.error`, skipped                                |
| RVA import, vocab doesn't exist       | `importRvaVocabulary()` called                            |
| RVA import, vocab exists              | `importRvaVocabulary()` not called                        |
| RVA imports disabled via config       | `importRvaVocabulary()` not called                        |
| Multiple files                        | Processed in sorted order                                 |

```bash
cd packages/redbox-core-types && npm test
```

### Integration Test

#### [NEW] [VocabularyBootstrapData.test.ts](test/integration/services/VocabularyBootstrapData.test.ts)

Mocha integration test against the live database.

**RVA mocking strategy**: The integration test stubs `RvaImportService.importRvaVocabulary` with a sinon stub that creates a minimal local vocabulary record (same shape as a real import) instead of calling the live RVA API. This avoids CI flakiness from network dependencies while still exercising the full bootstrap flow.

Test cases:

1. First call creates ANZSRC TOA vocab with 4 entries + 2 RVA vocabs (stubbed)
2. Second call is idempotent — no new records created
3. Cleanup in `after` hook destroys all created vocabularies and entries
