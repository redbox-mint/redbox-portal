import {AfterViewInit, Component, ElementRef, InjectionToken, Input, OnDestroy, ViewChild, inject} from "@angular/core";
import {FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel} from "@researchdatabox/portal-ng-common";
import {
  MapComponentName,
  MapDrawingMode,
  MapFieldComponentConfig,
  MapModelName,
  MapModelValueType,
  MapTileLayerConfig
} from "@researchdatabox/sails-ng-common";
// Type-only imports keep these libraries out of the eager bundle.
// The runtime modules are loaded on demand by `loadMapDependencies()` below
// so a record without a map field never pays the cost of leaflet, terra-draw,
// terra-draw-leaflet-adapter or @tmcw/togeojson.
import type * as L from "leaflet";
import type * as TerraDrawLibrary from "terra-draw";
import type * as TerraDrawLeafletAdapterLibrary from "terra-draw-leaflet-adapter";
import type {kml as ParseKmlToGeoJson} from "@tmcw/togeojson";
import {FormComponent} from "../form.component";

const mapMarkerIconPath = "assets/leaflet/marker-icon.png";
const mapMarkerIconRetinaPath = "assets/leaflet/marker-icon-2x.png";
const mapMarkerShadowPath = "assets/leaflet/marker-shadow.png";

export interface MapDependencies {
  L: typeof L;
  terraDraw: typeof TerraDrawLibrary;
  terraDrawLeafletAdapter: typeof TerraDrawLeafletAdapterLibrary;
  parseKmlToGeoJson: typeof ParseKmlToGeoJson;
}

let mapDependenciesPromise: Promise<MapDependencies> | undefined;
let leafletIconDefaultsApplied = false;

/**
 * Lazily resolve all runtime map dependencies as a single split chunk.
 *
 * Calling more than once returns the same promise so concurrent map fields on
 * the same form share one network/cache hit. The leaflet default-icon merge
 * runs once on first resolve so subsequent map instances see the correct icon
 * paths.
 */
function loadMapDependencies(): Promise<MapDependencies> {
  if (!mapDependenciesPromise) {
    mapDependenciesPromise = (async () => {
      // webpackChunkName lets the lazy chunk show up with a stable filename.
      const [leafletMod, terraDrawMod, terraDrawAdapterMod, toGeoJsonMod] = await Promise.all([
        import(/* webpackChunkName: "leaflet" */ "leaflet"),
        import(/* webpackChunkName: "terra-draw" */ "terra-draw"),
        import(/* webpackChunkName: "terra-draw-leaflet-adapter" */ "terra-draw-leaflet-adapter"),
        import(/* webpackChunkName: "togeojson" */ "@tmcw/togeojson"),
      ]);
      // Some bundlers wrap CommonJS namespaces in a `default` field. Unwrap if present.
      const leaflet = ((leafletMod as { default?: typeof L }).default ?? leafletMod) as typeof L;
      if (!leafletIconDefaultsApplied) {
        leaflet.Icon.Default.mergeOptions({
          iconUrl: mapMarkerIconPath,
          iconRetinaUrl: mapMarkerIconRetinaPath,
          shadowUrl: mapMarkerShadowPath
        });
        leafletIconDefaultsApplied = true;
      }
      return {
        L: leaflet,
        terraDraw: terraDrawMod as typeof TerraDrawLibrary,
        terraDrawLeafletAdapter: terraDrawAdapterMod as typeof TerraDrawLeafletAdapterLibrary,
        parseKmlToGeoJson: (toGeoJsonMod as { kml: typeof ParseKmlToGeoJson }).kml,
      };
    })();
    // Drop the cached promise on failure so a retry can re-fetch the chunk.
    mapDependenciesPromise.catch(() => {
      mapDependenciesPromise = undefined;
    });
  }
  return mapDependenciesPromise;
}

export const MAP_DEPENDENCIES_LOADER = new InjectionToken<() => Promise<MapDependencies>>("MAP_DEPENDENCIES_LOADER", {
  providedIn: "root",
  factory: () => loadMapDependencies
});

const emptyFeatureCollection = (): MapModelValueType => ({
  type: "FeatureCollection",
  features: []
});

interface TerraDrawDependencies {
  TerraDrawCtor?: new (...args: unknown[]) => unknown;
  AdapterCtor?: new (...args: unknown[]) => unknown;
  PointMode?: new (...args: unknown[]) => unknown;
  PolygonMode?: new (...args: unknown[]) => unknown;
  LineStringMode?: new (...args: unknown[]) => unknown;
  RectangleMode?: new (...args: unknown[]) => unknown;
  SelectMode?: new (...args: unknown[]) => unknown;
}

export class MapModel extends FormFieldModel<MapModelValueType> {
  protected override logName = MapModelName;
}

@Component({
  selector: "redbox-map",
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <div class="rb-map-wrapper">
        <div class="rb-map-frame">
          <div #mapHost class="rb-map-surface" [style.height]="mapHeight"></div>
          @if (isEditMode() && showDrawToolbar) {
            <div class="rb-map-toolbar">
              @for (mode of toolbarModes; track mode) {
                <button
                  type="button"
                  class="btn btn-light btn-sm rb-map-mode-btn"
                  [class.active]="activeMode === mode"
                  (click)="setDrawMode(mode)"
                  [disabled]="isDisabled"
                >
                  {{ modeLabels[mode] }}
                </button>
              }
            </div>
          }
        </div>
        @if (isEditMode() && enableImport) {
          <div class="rb-map-import mt-2">
            <label class="form-label">{{ importLabel }}</label>
            @if (coordinatesHelp) {
              <div class="small text-muted mb-1">{{ coordinatesHelp }}</div>
            }
            <textarea
              class="form-control"
              rows="5"
              [value]="importDataString"
              (input)="importDataString = $any($event.target).value"
              [disabled]="isDisabled"
            ></textarea>
            <div class="mt-2">
              <button type="button" class="btn btn-outline-primary btn-sm rb-map-import-btn" (click)="onImportClicked()" [disabled]="isDisabled">Import</button>
              @if (importError) {
                <span class="text-danger ms-2">{{ importError }}</span>
              }
            </div>
          </div>
        }
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  styles: [`
    .rb-map-wrapper {
      width: 100%;
    }

    .rb-map-frame {
      position: relative;
      width: 100%;
    }

    .rb-map-surface {
      width: 100%;
      min-height: 220px;
      border: 1px solid #d8dee6;
      border-radius: 0.4rem;
      overflow: hidden;
      background: #f9fafb;
    }

    .rb-map-toolbar {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      z-index: 800;
      pointer-events: auto;
    }

    .rb-map-mode-btn {
      min-width: 7rem;
      text-align: left;
      border-color: #b7c5d5;
      background: #fff;
    }

    .rb-map-mode-btn.active {
      border-color: #0d6efd;
      background: #e9f2ff;
      color: #0b5ed7;
      font-weight: 600;
    }
  `],
  standalone: false
})
export class MapComponent extends FormFieldBaseComponent<MapModelValueType> implements AfterViewInit, OnDestroy {
  protected override logName = MapComponentName;
  private readonly loadMapDependencies = inject(MAP_DEPENDENCIES_LOADER);

  @Input() public override model?: MapModel;
  @ViewChild("mapHost", {static: false}) private mapHost?: ElementRef<HTMLDivElement>;

  public mapHeight = "450px";
  public enableImport = true;
  public coordinatesHelp = "";
  public importLabel = "Enter KML or GeoJSON";
  public importDataString = "";
  public importError = "";

  private map?: L.Map;
  private draw?: any;
  private featureLayer?: L.GeoJSON;
  // Resolved on first ngAfterViewInit; held as an instance ref so render/import
  // helpers can use leaflet etc. without re-awaiting the shared module promise.
  private mapDeps?: MapDependencies;
  private _destroyed = false;
  private visibilityObserver?: IntersectionObserver;
  private center: [number, number] = [-24.67, 134.07];
  private zoom = 4;
  private tileLayers: MapTileLayerConfig[] = [];
  private enabledModes: MapDrawingMode[] = ["point", "polygon", "linestring", "rectangle", "select"];
  public toolbarModes: MapDrawingMode[] = [];
  public activeMode?: MapDrawingMode;
  public showDrawToolbar = false;
  public readonly modeLabels: Record<MapDrawingMode, string> = {
    point: "Point",
    polygon: "Polygon",
    linestring: "Line",
    rectangle: "Rectangle",
    select: "Select/Edit"
  };

  protected get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const cfg = (this.componentDefinition?.config as MapFieldComponentConfig) ?? new MapFieldComponentConfig();
    this.center = Array.isArray(cfg.center) && cfg.center.length === 2 ? cfg.center : [-24.67, 134.07];
    this.zoom = Number.isFinite(cfg.zoom) ? Number(cfg.zoom) : 4;
    this.mapHeight = String(cfg.mapHeight ?? "450px");
    this.tileLayers = Array.isArray(cfg.tileLayers) ? cfg.tileLayers : [];
    this.enabledModes = Array.isArray(cfg.enabledModes) && cfg.enabledModes.length > 0
      ? cfg.enabledModes
      : ["point", "polygon", "linestring", "rectangle", "select"];
    this.toolbarModes = [...this.enabledModes];
    this.activeMode = this.toolbarModes.find((mode) => mode !== "select") ?? this.toolbarModes[0];
    this.showDrawToolbar = this.toolbarModes.length > 0;
    this.enableImport = cfg.enableImport ?? true;
    this.coordinatesHelp = String(cfg.coordinatesHelp ?? "");
  }

  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
    // Kick off lazy load of the map runtime. The component remains in the
    // eager Angular bundle (registered as a form component) but the leaflet/
    // terra-draw chunks only download when a record actually has a map field.
    void this.loadMapDependencies()
      .then((deps) => {
        if (this._destroyed) {
          return;
        }
        this.mapDeps = deps;
        this.initialiseMap();
      })
      .catch((error) => {
        this.loggerService.warn(
          `${this.logName}: failed to load map dependencies, map will not render.`,
          error
        );
      });
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    this.visibilityObserver?.disconnect();
    this.visibilityObserver = undefined;
    try {
      this.draw?.stop?.();
    } catch {
      // Ignore best-effort cleanup errors for third-party draw internals.
    }
    this.draw = undefined;
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }

  public onImportClicked(): void {
    const importedValue = this.parseImport(this.importDataString);
    if (!importedValue) {
      return;
    }
    this.importError = "";
    this.importDataString = "";
    const merged = this.mergeCollections(this.currentModelValue(), importedValue);
    this.renderValue(merged, true);
    this.invalidateMap();
  }

  private initialiseMap(): void {
    if (!this.mapHost?.nativeElement || this.map || !this.mapDeps) {
      return;
    }
    const {L: leaflet} = this.mapDeps;
    const tileLayerConfig = this.tileLayers[0] ?? {
      name: "OpenStreetMap",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: {maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"}
    };
    const tileLayer = leaflet.tileLayer(tileLayerConfig.url, (tileLayerConfig.options ?? {}) as L.TileLayerOptions);

    this.map = leaflet.map(this.mapHost.nativeElement, {
      center: this.center,
      zoom: this.zoom,
      layers: [tileLayer]
    });

    const startingValue = this.currentModelValue();
    if (this.isEditMode()) {
      this.initialiseDraw();
      if (startingValue.features.length > 0) {
        this.pushFeaturesToDraw(startingValue.features);
      }
    } else {
      this.renderReadonlyLayer(startingValue);
    }

    this.installVisibilityObserver();
    this.invalidateMap();
  }

  private initialiseDraw(): void {
    if (!this.map || !this.mapDeps) {
      return;
    }

    try {
      const deps = this.getTerraDrawDependencies();
      const TerraDrawCtor = deps.TerraDrawCtor;
      const AdapterCtor = deps.AdapterCtor;
      const PointMode = deps.PointMode;
      const PolygonMode = deps.PolygonMode;
      const LineStringMode = deps.LineStringMode;
      const RectangleMode = deps.RectangleMode;
      const SelectMode = deps.SelectMode;
      if (!TerraDrawCtor || !AdapterCtor) {
        return;
      }
      const adapter = new AdapterCtor({map: this.map, lib: this.mapDeps.L});
      const modes: unknown[] = [];
      if (this.enabledModes.includes("point") && PointMode) {
        modes.push(new PointMode());
      }
      if (this.enabledModes.includes("polygon") && PolygonMode) {
        modes.push(new PolygonMode());
      }
      if (this.enabledModes.includes("linestring") && LineStringMode) {
        modes.push(new LineStringMode());
      }
      if (this.enabledModes.includes("rectangle") && RectangleMode) {
        modes.push(new RectangleMode({drawInteraction: "click-drag"}));
      }
      if (this.enabledModes.includes("select") && SelectMode) {
        modes.push(new SelectMode());
      }
      if (modes.length === 0) {
        return;
      }
      this.draw = new TerraDrawCtor({
        adapter,
        modes
      });

      this.draw.start?.();
      this.setInitialDrawMode();
      this.draw.on?.("change", () => {
        const value = this.readValueFromDraw();
        this.updateModelValue(value);
      });
    } catch (error) {
      this.loggerService.warn(`${this.logName}: failed to initialise TerraDraw, map will render without edit tooling.`, error);
    }
  }

  public setDrawMode(mode: MapDrawingMode): void {
    if (!this.draw || !this.toolbarModes.includes(mode)) {
      return;
    }
    this.draw.setMode?.(mode);
    this.activeMode = mode;
  }

  private getTerraDrawDependencies(): TerraDrawDependencies {
    if (!this.mapDeps) {
      return {};
    }
    const terraDraw = this.mapDeps.terraDraw as any;
    const terraDrawLeafletAdapter = this.mapDeps.terraDrawLeafletAdapter as any;
    return {
      TerraDrawCtor: terraDraw.TerraDraw,
      AdapterCtor: terraDrawLeafletAdapter.TerraDrawLeafletAdapter,
      PointMode: terraDraw.TerraDrawPointMode,
      PolygonMode: terraDraw.TerraDrawPolygonMode,
      LineStringMode: terraDraw.TerraDrawLineStringMode,
      RectangleMode: terraDraw.TerraDrawRectangleMode,
      SelectMode: terraDraw.TerraDrawSelectMode
    };
  }

  private renderReadonlyLayer(value: MapModelValueType): void {
    if (!this.map || !this.mapDeps) {
      return;
    }
    this.featureLayer?.removeFrom(this.map);
    this.featureLayer = this.mapDeps.L.geoJSON(value as any);
    this.featureLayer.addTo(this.map);
    this.fitToLayerBounds(this.featureLayer);
  }

  private renderValue(value: MapModelValueType, updateModel: boolean): void {
    if (this.isEditMode()) {
      this.pushFeaturesToDraw(value.features);
      if (updateModel) {
        this.updateModelValue(this.readValueFromDraw());
      }
      return;
    }
    this.renderReadonlyLayer(value);
    if (updateModel) {
      this.updateModelValue(value);
    }
  }

  private pushFeaturesToDraw(features: unknown[]): void {
    if (!Array.isArray(features) || features.length === 0) {
      return;
    }
    if (!this.draw) {
      const currentValue = this.currentModelValue();
      this.renderReadonlyLayer({...currentValue, features: [...currentValue.features, ...features as any[]]});
      return;
    }
    try {
      this.draw.addFeatures?.(features);
    } catch (error) {
      this.loggerService.warn(`${this.logName}: failed to add features to draw state.`, error);
    }
  }

  private readValueFromDraw(): MapModelValueType {
    if (!this.draw) {
      return this.currentModelValue();
    }
    const snapshot = this.draw.getSnapshot?.();
    if (snapshot && typeof snapshot === "object" && (snapshot as any).type === "FeatureCollection") {
      return this.normalizeFeatureCollection(snapshot);
    }
    if (Array.isArray(snapshot)) {
      return this.normalizeFeatureCollection({type: "FeatureCollection", features: snapshot});
    }
    return this.currentModelValue();
  }

  private updateModelValue(value: MapModelValueType): void {
    const normalized = this.normalizeFeatureCollection(value);
    this.formControl.setValue(normalized);
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }

  private currentModelValue(): MapModelValueType {
    const controlValue = this.normalizeFeatureCollection(this.formControl.value);
    if (controlValue.features.length > 0) {
      return controlValue;
    }
    const modelValue = this.normalizeFeatureCollection(this.model?.getValue());
    if (modelValue.features.length > 0) {
      return modelValue;
    }
    return controlValue;
  }

  private setInitialDrawMode(): void {
    const initialMode = this.activeMode;
    if (!initialMode) {
      return;
    }
    this.draw?.setMode?.(initialMode);
  }

  private normalizeFeatureCollection(value: unknown): MapModelValueType {
    if (!value || typeof value !== "object") {
      return emptyFeatureCollection();
    }
    const source = value as {type?: unknown; features?: unknown};
    if (source.type !== "FeatureCollection" || !Array.isArray(source.features)) {
      return emptyFeatureCollection();
    }
    return {
      type: "FeatureCollection",
      features: source.features as MapModelValueType["features"]
    };
  }

  private parseImport(value: string): MapModelValueType | null {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
      this.importError = "";
      return null;
    }
    try {
      if (trimmed.startsWith("<")) {
        if (!this.mapDeps) {
          this.importError = "Map import is not ready yet, please try again in a moment.";
          return null;
        }
        const xmlDoc = new DOMParser().parseFromString(trimmed, "text/xml");
        const converted = this.mapDeps.parseKmlToGeoJson(xmlDoc);
        return this.normalizeFeatureCollection(converted);
      }
      const parsed = JSON.parse(trimmed);
      return this.normalizeFeatureCollection(parsed);
    } catch {
      this.importError = "Entered text is not valid KML or GeoJSON";
      return null;
    }
  }

  private mergeCollections(currentValue: MapModelValueType, importedValue: MapModelValueType): MapModelValueType {
    return {
      type: "FeatureCollection",
      features: [...(currentValue.features ?? []), ...(importedValue.features ?? [])]
    };
  }

  private installVisibilityObserver(): void {
    if (!this.mapHost?.nativeElement || typeof IntersectionObserver === "undefined") {
      return;
    }
    this.visibilityObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        this.invalidateMap();
      }
    }, {threshold: 0.1});
    this.visibilityObserver.observe(this.mapHost.nativeElement);
  }

  private invalidateMap(): void {
    if (!this.map) {
      return;
    }
    globalThis.requestAnimationFrame?.(() => {
      this.map?.invalidateSize();
      if (this.featureLayer) {
        this.fitToLayerBounds(this.featureLayer);
      }
    });
    globalThis.setTimeout(() => {
      this.map?.invalidateSize();
      if (this.featureLayer) {
        this.fitToLayerBounds(this.featureLayer);
      }
    }, 0);
  }

  private fitToLayerBounds(layer: L.FeatureGroup | L.GeoJSON): void {
    if (!this.map) {
      return;
    }
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, {padding: [12, 12]});
    }
  }

  public isEditMode(): boolean {
    return this.getFormComponent.editMode() && !this.isReadonly;
  }
}
