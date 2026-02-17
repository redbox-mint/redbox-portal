# Map Component Implementation

- [x] Plan the new MapComponent (Leaflet + TerraDraw)
  - [x] Study legacy `field-map.component.ts` / `field-map.html`
  - [x] Study canonical `CheckboxTreeComponent` pattern
  - [x] Research TerraDraw integration
  - [x] Review visitor infrastructure & migration visitor
  - [x] Write implementation plan
  - [x] Get user approval on plan

- [ ] Scaffold and implement (`sails-ng-common` contracts)
  - Plan section: `implementation_plan.md` → `sails-ng-common — Config contracts`
  - Acceptance criteria:
    - `MapModelValueType` is `GeoJSON.FeatureCollection` only.
    - `MapDrawingMode` union type is defined and used by config.
    - Default model value is `{ type: "FeatureCollection", features: [] }`.
    - Dictionary and index exports include map types/models.

- [ ] Wire visitor infrastructure
  - Plan section: `implementation_plan.md` → `sails-ng-common — Visitor infrastructure`
  - Acceptance criteria:
    - Base visitor interfaces include map visit methods.
    - Concrete visitors compile with new map visit methods.
    - Construct/validator visitors drop unsupported `enabledModes` entries with warning logging.

- [ ] Implement Angular component
  - Plan section: `implementation_plan.md` → `Angular — Component implementation`
  - Acceptance criteria:
    - Leaflet + TerraDraw initializes in edit mode and updates model GeoJSON.
    - View mode renders map/data without draw tooling.
    - Hidden-tab/layout handling includes observer + fallback invalidation.
    - Import supports GeoJSON and KML parsing paths.
    - `angular.json` updated: Leaflet CSS in `styles`, marker icon assets glob in `assets` (build + test targets).
    - `L.Icon.Default.mergeOptions` applied at module load to fix bundled marker icon paths.

- [ ] Add migration visitor mapping
  - Plan section: `implementation_plan.md` → `Migration visitor`
  - Acceptance criteria:
    - `MapField` + `MapComponent` mappings resolve to `MapComponent`/`MapModel`.
    - `leafletOptions` and `drawOptions` migrate into new map config.
    - Legacy `{}`/empty map model values normalize to empty FeatureCollection.

- [ ] Add tests
  - Plan section: `implementation_plan.md` → `Verification Plan`
  - Acceptance criteria:
    - Angular spec covers import, view mode, pre-existing features, and hidden-tab sizing behavior.
    - `sails-ng-common` tests cover migration transforms, mode validation, and visitor traversal wiring.

- [ ] Verify
  - Plan section: `implementation_plan.md` → `Verification Plan` (Automated + Manual)
  - Acceptance criteria:
    - `cd angular && npm test` passes.
    - `cd packages/sails-ng-common && npm test && npm run compile` passes.
    - Manual checklist items (tab render, draw/edit/delete, import, persistence, view mode, custom tile layer) are completed.
