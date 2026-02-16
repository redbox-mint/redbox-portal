# Map Component — Leaflet + TerraDraw

Replaces legacy `MapField` / `MapComponent` (Leaflet + Leaflet.Draw) with a new form-framework component using **Leaflet** for the map surface and **TerraDraw** for drawing interactions.

## Legacy behaviour to replicate

| Feature | Legacy implementation |
|---|---|
| Map rendering | Leaflet `Map` with Google tile layers |
| Drawing | Leaflet.Draw — markers, polygons, polylines, rectangles |
| Persisted model | GeoJSON `FeatureCollection` |
| Import | Textarea for pasting KML or GeoJSON |
| Config overrides | `leafletOptions` (zoom, center), `drawOptions` |
| Tab awareness | `invalidateSize()` when container becomes visible |
| View mode | Read-only map (no draw toolbar) |

## Decisions (confirmed)

- **Tile provider**: OpenStreetMap default; custom tile layers configurable via `tileLayers` config array (Google, etc.)
- **KML import**: Retained via `@tmcw/togeojson` (lightweight KML→GeoJSON converter)
- **Drawing modes**: Same as legacy — point, polygon, linestring, rectangle + select mode for editing. Config-driven so others can be enabled later.

---

## Proposed Changes

### sails-ng-common — Config contracts

#### [NEW] [`packages/sails-ng-common/src/config/component/map.outline.ts`](packages/sails-ng-common/src/config/component/map.outline.ts)

Type-safe config interfaces following the `CheckboxTree` pattern:

- `MapComponentName = "MapComponent"`, `MapModelName = "MapModel"`
- `MapModelValueType = GeoJSON.FeatureCollection`
- `MapDrawingMode = "point" | "polygon" | "linestring" | "rectangle" | "select"`
- `MapFieldComponentConfigFrame`:
  - `center?: [number, number]` — default `[-24.67, 134.07]`
  - `zoom?: number` — default `4`
  - `mapHeight?: string` — default `"450px"`
  - `tileLayers?: Array<{ name: string; url: string; options?: Record<string, unknown> }>`
  - `enabledModes?: MapDrawingMode[]` — default `["point", "polygon", "linestring", "rectangle", "select"]`
  - `enableImport?: boolean` — default `true`
  - `coordinatesHelp?: string`

Validation requirement:
- Unknown `enabledModes` values are dropped during config construction/migration with warning logging.

#### [NEW] [`packages/sails-ng-common/src/config/component/map.model.ts`](packages/sails-ng-common/src/config/component/map.model.ts)

Config/definition/form classes with `accept(visitor)`, plus `MapMap` and `MapDefaults`.

Model/default requirement:
- Default model value is always a valid empty feature collection:
  - `{ type: "FeatureCollection", features: [] }`

---

#### [MODIFY] [`packages/sails-ng-common/src/config/dictionary.outline.ts`](packages/sails-ng-common/src/config/dictionary.outline.ts)

Add `MapTypes` to `AllTypes`.

#### [MODIFY] [`packages/sails-ng-common/src/config/dictionary.model.ts`](packages/sails-ng-common/src/config/dictionary.model.ts)

Add `MapMap` / `MapDefaults`.

#### [MODIFY] [`packages/sails-ng-common/src/index.ts`](packages/sails-ng-common/src/index.ts)

Export `map.outline` and `map.model`.

---

### sails-ng-common — Visitor infrastructure

#### [MODIFY] [`packages/sails-ng-common/src/config/visitor/base.outline.ts`](packages/sails-ng-common/src/config/visitor/base.outline.ts) + [`packages/sails-ng-common/src/config/visitor/base.model.ts`](packages/sails-ng-common/src/config/visitor/base.model.ts)

Add `visitMapFieldComponentDefinition`, `visitMapFieldModelDefinition`, `visitMapFormComponentDefinition`.

#### [MODIFY] Concrete visitors

| File | Notes |
|---|---|
| `construct.visitor.ts` | Config property overrides + map mode validation |
| `client.visitor.ts` | Pass-through |
| `data-value.visitor.ts` | Pass-through (GeoJSON object) |
| `json-type-def.visitor.ts` | `object` type |
| `validator.visitor.ts` | Pass-through + validate mode list |
| `template.visitor.ts` | `noop()` |
| `migrate-config-v4-v5.visitor.ts` | See migration section below |

---

### Angular — Component implementation

#### [NEW] [`angular/projects/researchdatabox/form/src/app/component/map.component.ts`](angular/projects/researchdatabox/form/src/app/component/map.component.ts)

**`MapModel`** — extends `FormFieldModel<MapModelValueType>`.

**`MapComponent`** — extends `FormFieldBaseComponent<MapModelValueType>`:

- `setPropertiesFromComponentMapEntry` — reads config
- `ngAfterViewInit` — initialises Leaflet + TerraDraw:
  ```typescript
  const map = L.map(mapEl, { center, zoom, layers: [tileLayer] });
  const adapter = new TerraDrawLeafletAdapter({ map, lib: L });
  const draw = new TerraDraw({ adapter, modes: [...] });
  draw.start();
  ```
- TerraDraw `change` event → serialises as GeoJSON → `formControl.setValue(geojson)`
- `ngOnDestroy` — `draw.stop()`, `map.remove()`, disconnect observer
- Pre-existing model value → `draw.addFeatures()` on init
- Import: textarea + button; `@tmcw/togeojson` for KML, `JSON.parse` for GeoJSON; adds via `draw.addFeatures()`
- View mode: map + GeoJSON overlay, no TerraDraw

#### Tab / hidden container handling

> [!IMPORTANT]
> **Leaflet tile rendering in hidden tabs** — Yes, this is still an issue. When Leaflet initialises inside `display: none`, it can't calculate container dimensions and tiles render incorrectly.

**Strategy**: `IntersectionObserver` on the map container element, with fallback invalidation when the observer path does not fire in time.

```typescript
private visibilityObserver?: IntersectionObserver;

ngAfterViewInit() {
  // ... create map ...
  this.visibilityObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && this.map) {
        this.map.invalidateSize();
      }
    },
    { threshold: 0.1 }
  );
  this.visibilityObserver.observe(this.mapEl.nativeElement);

  // Fallback for layout transitions where observer timing misses first paint.
  requestAnimationFrame(() => this.map?.invalidateSize());
  setTimeout(() => this.map?.invalidateSize(), 0);
}

onImportOrFeatureLoad() {
  // After adding features in hidden containers, re-run size + bounds.
  requestAnimationFrame(() => {
    this.map?.invalidateSize();
    // fit bounds when valid feature bounds are available
  });
}

ngOnDestroy() {
  this.visibilityObserver?.disconnect();
}
```

This remains self-contained and avoids coupling the map to the tab system.

---

#### [MODIFY] [`angular/projects/researchdatabox/form/src/app/form.module.ts`](angular/projects/researchdatabox/form/src/app/form.module.ts)

Add `MapComponent` to `declarations`. Add `FormsModule` to `imports` (for `ngModel`).

#### [MODIFY] [`angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts`](angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts)

Register `MapComponent` / `MapModel`.

---

### Dependencies

#### [MODIFY] [`angular/package.json`](angular/package.json)

```diff
+    "leaflet": "^1.9.4",
+    "terra-draw": "^1.0.0",
+    "terra-draw-leaflet-adapter": "^1.0.0",
+    "@tmcw/togeojson": "^7.1.0"
```

devDependencies:
```diff
+    "@types/leaflet": "^1.9.8"
```

#### [MODIFY] [`angular/angular.json`](angular/angular.json) — `@researchdatabox/form` build target

**Leaflet CSS** — add to the `styles` array for `@researchdatabox/form`:

```diff
 "styles": [
   "projects/researchdatabox/form/src/styles.scss",
+  "node_modules/leaflet/dist/leaflet.css"
 ],
```

**Leaflet marker icon assets** — add a glob entry to the `assets` array to copy Leaflet's default marker images into the build output:

```diff
 "assets": [
   "projects/researchdatabox/form/src/favicon.ico",
   "projects/researchdatabox/form/src/assets",
+  {
+    "glob": "**/*",
+    "input": "node_modules/leaflet/dist/images",
+    "output": "assets/leaflet"
+  }
 ],
```

> [!NOTE]
> The same `styles` and `assets` entries must also be added to the `test` target for `@researchdatabox/form` so that unit tests can resolve Leaflet styles and icons.

#### Leaflet marker icon fix — in `map.component.ts`

Leaflet's `Icon.Default` assumes marker images at a relative path that doesn't survive Angular/esbuild bundling. Override the icon paths at component init:

```typescript
import * as L from 'leaflet';

// Fix Leaflet default marker icon paths for Angular bundled builds
const iconRetinaUrl = 'assets/leaflet/marker-icon-2x.png';
const iconUrl = 'assets/leaflet/marker-icon.png';
const shadowUrl = 'assets/leaflet/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });
```

This runs once at module load and aligns with the `output: "assets/leaflet"` path from `angular.json`.

---

### Migration visitor

#### [MODIFY] [`packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts`](packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts)

```typescript
"MapField": {
    "": { componentClassName: MapComponentName, modelClassName: MapModelName },
    "MapComponent": { componentClassName: MapComponentName, modelClassName: MapModelName },
},
```

In `visitMapFieldComponentDefinition`, migrate legacy config:
- `leafletOptions.center` → `config.center`
- `leafletOptions.zoom` → `config.zoom`
- `drawOptions.draw` → derive `config.enabledModes`
- Unknown/unsupported legacy draw mode flags are ignored with warning logging

In `visitMapFieldModelDefinition`, normalize legacy empty values:
- `{}` / null-ish values → `{ type: "FeatureCollection", features: [] }`

---

### Test form config

#### [MODIFY] [`typescript/form-config/default-1.0-draft.ts`](typescript/form-config/default-1.0-draft.ts)

Add a `MapComponent` entry to Tab 2 for manual testing:

```typescript
{
    name: 'map_coverage',
    layout: {
        class: 'DefaultLayout',
        config: {
            label: 'Geographic coverage',
            helpText: 'Draw or import the geographic coverage area.',
        }
    },
    model: {
        class: 'MapModel',
        config: {
            defaultValue: { type: 'FeatureCollection', features: [] }
        }
    },
    component: {
        class: 'MapComponent',
        config: {
            zoom: 4,
            center: [-24.67, 134.07],
            enableImport: true,
        }
    }
}
```

Placing this on **Tab 2** doubles as a test for hidden-tab sizing behavior.

---

## Verification Plan

### Automated Tests

#### Angular component tests

[NEW] [`angular/projects/researchdatabox/form/src/app/component/map.component.spec.ts`](angular/projects/researchdatabox/form/src/app/component/map.component.spec.ts):

1. Component creates
2. Map container height from config
3. Import controls visible/hidden based on `enableImport`
4. GeoJSON import updates model
5. Invalid import shows error
6. View mode — no import controls
7. Pre-existing model renders features
8. Hidden tab/layout transition triggers `invalidateSize` via observer/fallback path
9. Non-empty default feature collection renders without errors

#### sails-ng-common visitor + migration tests

[NEW] map visitor test files under `packages/sails-ng-common`:

1. `migrate-config-v4-v5` maps `MapField` + `MapComponent` to `MapComponent`/`MapModel`
2. `leafletOptions.center/zoom` migration into map config
3. `drawOptions.draw` migration to typed `enabledModes`
4. Invalid mode strings are dropped with warning logging
5. Legacy `{}`/empty values normalize to empty feature collection
6. New visitor methods are wired and do not regress existing dictionary traversal

Run commands:

```bash
cd angular && npm test
cd packages/sails-ng-common && npm test
cd packages/sails-ng-common && npm run compile
```

### Manual Verification

Using `typescript/form-config/default-1.0-draft.ts`:
1. Navigate to Tab 2 → map renders correctly (tiles load after tab switch)
2. Draw polygon/marker/line/rectangle → model updates with GeoJSON
3. Edit and delete features → model updates
4. Paste GeoJSON → features appear
5. Paste KML → features appear
6. Invalid paste → error message
7. Save/reload → features persist
8. View mode → no drawing tools
9. Custom tile layer config renders expected tiles
