# Implementation Plan - Record Search Migration

Migrate the legacy `angular-legacy/record_search` application to the modern Angular framework within the `angular/` workspace. The goal is feature parity and identical UI.

## User Review Required

> [!IMPORTANT]
> **API Logic**: The legacy app uses a specific `/record/search/{type}` endpoint with custom query parameters (`refiner|name=val`). This logic is **not** present in `portal-ng-common/RecordService`. I plan to implement a local `SearchService` within the new app to preserve this logic and ensure compatibility without modifying the shared library for now.

> [!NOTE]
> **UI Framework**: The legacy app uses Bootstrap 3 classes (`panel`, `col-md-`, `glyphicon`). I will migrate these to **Bootstrap 4** as used in `redbox-portal-2` (via `ngx-bootstrap`). I will update these to their Bootstrap 4 equivalents where necessary (e.g., `card` for `panel`).

## Proposed Changes

### 1. New Angular Application

- **Generate App**: Use `redbox-hook-kit` generator (or manual `ng generate application`) to create `record-search` in `angular/projects/researchdatabox/`.
- **Configuration**: Update `angular.json` to output assets to `assets/angular/record-search/browser` (checking `redbox-angular-apps` skill patterns).

### 2. Component Migration

- **`RecordSearchComponent`**:
  - Port `record-search.component.ts` logic.
  - Port `record_search.html` template.
  - Adapt inputs: `record_type`, `search_str`, `search_url` (read from ElementRef or Inputs on the root component).
- **`RecordSearchRefinerComponent`**:
  - Port `record-search-refiner.component.ts`.
  - Port template.

### 3. Service & Model Migration

- **`SearchService`**:
  - Create `search.service.ts` in the new app.
  - Port `search()` method and helpers from legacy `RecordsService`.
  - Port `RecordSearchParams` and `RecordSearchRefiner` classes.
- **Dependencies**:
  - Use `portal-ng-common` for `ConfigService`, `UtilityService`, etc. where applicable.
  - Use `ngx-bootstrap` for pagination and dropdowns (replacing legacy `pagination` directive).

### 4. Integration

- **View Update**:
  - Update `views/default/default/record/search.ejs` to load the new Angular bundles (`main.js`, `polyfills.js`, `runtime.js`, etc. - module/nomodule pattern if generic, or specific bundle names).

## Verification Plan

### Automated Tests

- **Unit Tests**:
  - Run `ng test record-search` to verify component logic.
  - I will create basic unit tests for `SearchService` to verify query string construction.

### Manual Verification

1.  **Build**: Run `npm run build record-search` and check for success.
2.  **Deployment**: (Requires user context) - Check that files are written to `assets/angular/record-search`.
3.  **Runtime**:
    - Load the search page (`/record/search/rdmp`).
    - Verify the search bar appears.
    - Verify results are loaded.
    - Verify facets/refiners allow filtering.
    - Verify usage of "Advanced Search" toggle.
