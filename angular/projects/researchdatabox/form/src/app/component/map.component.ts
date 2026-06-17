import {AfterViewInit, Component, ElementRef, InjectionToken, Input, OnDestroy, ViewChild, inject} from "@angular/core";
import {FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel, ModifyOptions} from "@researchdatabox/portal-ng-common";
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
// so a record without a map field never pays the cost of OpenLayers, terra-draw,
// terra-draw-openlayers-adapter or @tmcw/togeojson.
import type OLMap from "ol/Map.js";
import type OLView from "ol/View.js";
import type OLTileLayer from "ol/layer/Tile.js";
import type OLVectorLayer from "ol/layer/Vector.js";
import type OLVectorSource from "ol/source/Vector.js";
import type OLXYZ from "ol/source/XYZ.js";
import type OLGeoJSON from "ol/format/GeoJSON.js";
import type OLFeature from "ol/Feature.js";
import type OLCircle from "ol/style/Circle.js";
import type OLFill from "ol/style/Fill.js";
import type OLIcon from "ol/style/Icon.js";
import type OLStroke from "ol/style/Stroke.js";
import type OLStyle from "ol/style/Style.js";
import type * as TerraDrawLibrary from "terra-draw";
import type * as TerraDrawOpenLayersAdapterLibrary from "terra-draw-openlayers-adapter";
import type {kml as ParseKmlToGeoJson} from "@tmcw/togeojson";
import {FormComponent} from "../form.component";

export interface MapDependencies {
  Map: typeof OLMap;
  View: typeof OLView;
  TileLayer: typeof OLTileLayer;
  VectorLayer: typeof OLVectorLayer;
  XYZ: typeof OLXYZ;
  VectorSource: typeof OLVectorSource;
  GeoJSON: typeof OLGeoJSON;
  fromLonLat: (coordinate: [number, number]) => number[];
  toLonLat: (coordinate: [number, number]) => number[];
  getUserProjection: () => any;
  extentIsEmpty: (extent: any) => boolean;
  Feature: typeof OLFeature;
  Fill: typeof OLFill;
  Stroke: typeof OLStroke;
  Circle: typeof OLCircle;
  Style: typeof OLStyle;
  Icon: typeof OLIcon;
  Projection: any;
  terraDraw: typeof TerraDrawLibrary;
  terraDrawOpenLayersAdapter: typeof TerraDrawOpenLayersAdapterLibrary;
  parseKmlToGeoJson: typeof ParseKmlToGeoJson;
}

let mapDependenciesPromise: Promise<MapDependencies> | undefined;

function loadMapDependencies(): Promise<MapDependencies> {
  if (!mapDependenciesPromise) {
    mapDependenciesPromise = (async (): Promise<MapDependencies> => {
      const [
        olMapMod,
        olViewMod,
        olTileLayerMod,
        olVectorLayerMod,
        olXyzMod,
        olVectorSourceMod,
        olGeoJsonMod,
        olProjMod,
        olExtentMod,
        olFeatureMod,
        olFillMod,
        olStrokeMod,
        olCircleMod,
        olStyleMod,
        olIconMod,
        terraDrawMod,
        terraDrawAdapterMod,
        toGeoJsonMod,
      ] = await Promise.all([
        import(/* webpackChunkName: "ol-map" */ "ol/Map.js"),
        import(/* webpackChunkName: "ol-view" */ "ol/View.js"),
        import(/* webpackChunkName: "ol-layer-tile" */ "ol/layer/Tile.js"),
        import(/* webpackChunkName: "ol-layer-vector" */ "ol/layer/Vector.js"),
        import(/* webpackChunkName: "ol-source-xyz" */ "ol/source/XYZ.js"),
        import(/* webpackChunkName: "ol-source-vector" */ "ol/source/Vector.js"),
        import(/* webpackChunkName: "ol-format-geojson" */ "ol/format/GeoJSON.js"),
        import(/* webpackChunkName: "ol-proj" */ "ol/proj.js"),
        import(/* webpackChunkName: "ol-extent" */ "ol/extent.js"),
        import(/* webpackChunkName: "ol-feature" */ "ol/Feature.js"),
        import(/* webpackChunkName: "ol-fill" */ "ol/style/Fill.js"),
        import(/* webpackChunkName: "ol-stroke" */ "ol/style/Stroke.js"),
        import(/* webpackChunkName: "ol-circle" */ "ol/style/Circle.js"),
        import(/* webpackChunkName: "ol-style" */ "ol/style/Style.js"),
        import(/* webpackChunkName: "ol-icon" */ "ol/style/Icon.js"),
        import(/* webpackChunkName: "terra-draw" */ "terra-draw"),
        import(/* webpackChunkName: "terra-draw-openlayers-adapter" */ "terra-draw-openlayers-adapter"),
        import(/* webpackChunkName: "togeojson" */ "@tmcw/togeojson"),
      ]);

      const unwrap = <T>(mod: unknown): T =>
        ((mod as { default?: T }).default ?? mod) as T;

      const projMod = olProjMod as typeof import("ol/proj.js");
      const extentMod = olExtentMod as typeof import("ol/extent.js");

      return {
        Map: unwrap<typeof OLMap>(olMapMod),
        View: unwrap<typeof OLView>(olViewMod),
        TileLayer: unwrap<typeof OLTileLayer>(olTileLayerMod),
        VectorLayer: unwrap<typeof OLVectorLayer>(olVectorLayerMod),
        XYZ: unwrap<typeof OLXYZ>(olXyzMod),
        VectorSource: unwrap<typeof OLVectorSource>(olVectorSourceMod),
        GeoJSON: unwrap<typeof OLGeoJSON>(olGeoJsonMod),
        fromLonLat: projMod.fromLonLat,
        toLonLat: projMod.toLonLat,
        getUserProjection: projMod.getUserProjection,
        extentIsEmpty: extentMod.isEmpty,
        Feature: unwrap<typeof OLFeature>(olFeatureMod),
        Fill: unwrap<typeof OLFill>(olFillMod),
        Stroke: unwrap<typeof OLStroke>(olStrokeMod),
        Circle: unwrap<typeof OLCircle>(olCircleMod),
        Style: unwrap<typeof OLStyle>(olStyleMod),
        Icon: unwrap<typeof OLIcon>(olIconMod),
        Projection: projMod.Projection,
        terraDraw: terraDrawMod as typeof TerraDrawLibrary,
        terraDrawOpenLayersAdapter: terraDrawAdapterMod as typeof TerraDrawOpenLayersAdapterLibrary,
        parseKmlToGeoJson: (toGeoJsonMod as { kml: typeof ParseKmlToGeoJson }).kml,
      };
    })();
    mapDependenciesPromise.catch(() => {
      mapDependenciesPromise = undefined;
    });
  }
  return mapDependenciesPromise!;
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

type TerraDrawModeName = Exclude<MapDrawingMode, "select">;

type TerraDrawSelectModeOptions = {
  allowManualDeselection: boolean;
  allowManualSelection: boolean;
  flags: Record<string, {
    feature: {
      draggable: boolean;
      coordinates?: {
        draggable: boolean;
        midpoints: boolean | {draggable: boolean};
        deletable: boolean;
      };
    };
  }>;
  pointerDistance: number;
};

export class MapModel extends FormFieldModel<MapModelValueType> {
  protected override logName = MapModelName;
}

function expandTileUrl(url: string, subdomains?: unknown): string | string[] {
  if (!url.includes("{s}")) {
    return url;
  }
  const rawSubs = typeof subdomains === "string"
    ? subdomains.split("")
    : Array.isArray(subdomains)
      ? subdomains.map((subdomain) => String(subdomain))
      : [];
  const subs = rawSubs.length > 0 ? rawSubs : ["a", "b", "c"];
  if (subs.length === 1) {
    return url.replace("{s}", subs[0]);
  }
  return subs.map((s) => url.replace("{s}", s));
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
              @if (canSelectFeatures && hasFeatures()) {
                <button
                  type="button"
                  class="btn btn-light btn-sm rb-map-mode-btn rb-map-select-btn"
                  [class.active]="activeMode === 'select'"
                  (click)="setDrawMode('select')"
                  [disabled]="isDisabled"
                >
                  {{ modeLabels['select'] }}
                </button>
              }
              @if (canDeleteSelectedFeatures && selectedFeatureIds.size > 0) {
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm rb-map-delete-btn"
                  (click)="deleteSelectedFeatures()"
                  [disabled]="isDisabled"
                >
                  Delete selected
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

  private map?: OLMap;
  private draw?: any;
  private featureLayer?: OLVectorLayer<OLVectorSource>;
  private vectorSource?: OLVectorSource;
  private mapDeps?: MapDependencies;
  private _destroyed = false;
  private drawInitialisePending = false;
  private drawReadyObserver?: MutationObserver;
  private visibilityObserver?: IntersectionObserver;
  private center: [number, number] = [-24.67, 134.07];
  private zoom = 4;
  private tileLayers: MapTileLayerConfig[] = [];
  private enabledModes: MapDrawingMode[] = ["point", "polygon", "linestring", "rectangle", "select"];
  public toolbarModes: MapDrawingMode[] = [];
  public activeMode?: MapDrawingMode;
  public showDrawToolbar = false;
  public canSelectFeatures = false;
  public canDeleteSelectedFeatures = true;
  public selectedFeatureIds = new Set<string | number>();
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
    this.canSelectFeatures = this.enabledModes.includes("select");
    this.canDeleteSelectedFeatures = this.enabledModes.includes("select");
    this.toolbarModes = this.enabledModes.filter((mode) => mode !== "select");
    this.activeMode = this.toolbarModes[0] ?? (this.canSelectFeatures ? "select" : undefined);
    this.showDrawToolbar = this.enabledModes.length > 0;
    this.enableImport = cfg.enableImport ?? true;
    this.coordinatesHelp = String(cfg.coordinatesHelp ?? "");
  }

  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
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
    this.drawReadyObserver?.disconnect();
    this.drawReadyObserver = undefined;
    try {
      this.draw?.stop?.();
    } catch {
      // Ignore best-effort cleanup errors for third-party draw internals.
    }
    this.draw = undefined;
    if (this.map) {
      this.map.setTarget(undefined);
      this.map = undefined;
    }
    this.featureLayer = undefined;
    this.vectorSource = undefined;
    this.selectedFeatureIds.clear();
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

  public override setDisabled(disabled: boolean, opts?: ModifyOptions): void {
    super.setDisabled(disabled, opts);
    if (!disabled) {
      this.ensureDrawInitialised();
    }
  }

  private initialiseMap(): void {
    if (!this.mapHost?.nativeElement || this.map || !this.mapDeps) {
      return;
    }
    const deps = this.mapDeps;

    const tileLayerConfig = this.tileLayers[0] ?? {
      name: "OpenStreetMap",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: {maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"}
    };

    const tileOptions: Record<string, unknown> = {};
    const rawOptions = (tileLayerConfig.options ?? {}) as Record<string, unknown>;
    if (rawOptions["attribution"]) {
      tileOptions["attributions"] = [rawOptions["attribution"]];
    }
    if (rawOptions["maxZoom"] != null) {
      tileOptions["maxZoom"] = rawOptions["maxZoom"];
    }
    if (rawOptions["minZoom"] != null) {
      tileOptions["minZoom"] = rawOptions["minZoom"];
    }
    if (rawOptions["crossOrigin"] != null) {
      tileOptions["crossOrigin"] = rawOptions["crossOrigin"];
    }
    if (rawOptions["wrapX"] != null) {
      tileOptions["wrapX"] = rawOptions["wrapX"];
    }
    if (rawOptions["tileSize"] != null) {
      tileOptions["tileSize"] = rawOptions["tileSize"];
    }

    const resolvedUrl = expandTileUrl(tileLayerConfig.url, rawOptions["subdomains"]);
    if (Array.isArray(resolvedUrl)) {
      tileOptions["urls"] = resolvedUrl;
    } else {
      tileOptions["url"] = resolvedUrl;
    }

    const tileLayer = new deps.TileLayer({
      source: new deps.XYZ(tileOptions as any)
    });

    const olView = new deps.View({
      center: deps.fromLonLat([this.center[1], this.center[0]]),
      zoom: this.zoom
    });

    this.map = new deps.Map({
      target: this.mapHost.nativeElement,
      layers: [tileLayer],
      view: olView
    });

    const startingValue = this.currentModelValue();
    if (this.isEditMode()) {
      this.scheduleDrawInitialisation();
    } else {
      this.renderReadonlyLayer(startingValue);
    }

    this.installVisibilityObserver();
    this.invalidateMap();
  }

  private ensureDrawInitialised(): void {
    if (this.draw || !this.map || !this.mapDeps || !this.isEditMode()) {
      return;
    }
    if (!this.hasOpenLayersEventElement()) {
      this.waitForOpenLayersEventElement();
      return;
    }
    this.drawReadyObserver?.disconnect();
    this.drawReadyObserver = undefined;
    this.removeFeatureLayer();
    this.initialiseDraw();
    const startingValue = this.currentModelValue();
    if (startingValue.features.length > 0) {
      this.pushFeaturesToDraw(startingValue.features);
    }
  }

  private scheduleDrawInitialisation(): void {
    if (this.drawInitialisePending || this._destroyed) {
      return;
    }
    this.drawInitialisePending = true;
    globalThis.requestAnimationFrame(() => {
      this.drawInitialisePending = false;
      this.ensureDrawInitialised();
    });
  }

  private waitForOpenLayersEventElement(): void {
    const eventContainer = this.getOpenLayersEventContainer();
    if (!eventContainer || this.drawReadyObserver || typeof MutationObserver === "undefined") {
      return;
    }
    this.map?.updateSize();
    try {
      (this.map as any)?.renderSync?.();
    } catch (err) {
      console.warn("OpenLayers renderSync() failed; falling back to MutationObserver for draw initialisation", err);
    }
    if (this.hasOpenLayersEventElement()) {
      this.ensureDrawInitialised();
      return;
    }
    this.drawReadyObserver = new MutationObserver(() => {
      if (this.hasOpenLayersEventElement()) {
        this.drawReadyObserver?.disconnect();
        this.drawReadyObserver = undefined;
        this.ensureDrawInitialised();
      }
    });
    this.drawReadyObserver.observe(eventContainer, {childList: true, subtree: true});
  }

  private hasOpenLayersEventElement(): boolean {
    const eventContainer = this.getOpenLayersEventContainer();
    if (!eventContainer) {
      return false;
    }
    return eventContainer.querySelector("canvas") != null;
  }

  private getOpenLayersEventContainer(): HTMLElement | undefined {
    const viewport = (this.map as any)?.getViewport?.() as HTMLElement | undefined;
    return viewport ?? this.mapHost?.nativeElement;
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

      const openLayersLib = {
        Icon: this.mapDeps.Icon,
        Fill: this.mapDeps.Fill,
        Feature: this.mapDeps.Feature,
        GeoJSON: this.mapDeps.GeoJSON,
        Style: this.mapDeps.Style,
        Circle: this.mapDeps.Circle,
        VectorLayer: this.mapDeps.VectorLayer,
        VectorSource: this.mapDeps.VectorSource,
        Stroke: this.mapDeps.Stroke,
        Projection: this.mapDeps.Projection,
        getUserProjection: this.mapDeps.getUserProjection,
        fromLonLat: this.mapDeps.fromLonLat,
        toLonLat: this.mapDeps.toLonLat,
      };

      const adapter = new AdapterCtor({map: this.map, lib: openLayersLib});
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
        modes.push(new SelectMode(this.buildSelectModeOptions()));
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
      this.draw.on?.("change", (changes?: {deletedIds?: unknown[]}) => {
        this.removeDeletedSelections(changes?.deletedIds);
        const value = this.readValueFromDraw();
        this.updateModelValue(value);
      });
      this.draw.on?.("select", (id: string | number) => {
        this.selectedFeatureIds.add(id);
      });
      this.draw.on?.("deselect", (id: string | number) => {
        this.selectedFeatureIds.delete(id);
      });
    } catch (error) {
      this.loggerService.warn(`${this.logName}: failed to initialise TerraDraw, map will render without edit tooling.`, error);
    }
  }

  public setDrawMode(mode: MapDrawingMode): void {
    if (!this.draw || !this.enabledModes.includes(mode)) {
      return;
    }
    this.draw.setMode?.(mode);
    this.activeMode = mode;
  }

  public hasFeatures(): boolean {
    return this.currentModelValue().features.length > 0;
  }

  public deleteSelectedFeatures(): void {
    if (!this.draw || this.selectedFeatureIds.size === 0 || this.isDisabled) {
      return;
    }
    const ids = Array.from(this.selectedFeatureIds);
    try {
      this.draw.removeFeatures?.(ids);
      this.selectedFeatureIds.clear();
      this.resetActiveDrawModeAfterDelete();
    } catch (error) {
      this.loggerService.warn(`${this.logName}: failed to delete selected map features.`, error);
    }
  }

  private resetActiveDrawModeAfterDelete(): void {
    if (!this.draw || !this.activeMode) {
      return;
    }
    this.draw.setMode?.(this.activeMode);
  }

  private buildSelectModeOptions(): TerraDrawSelectModeOptions {
    const drawableModes = this.enabledModes.filter((mode): mode is TerraDrawModeName => mode !== "select");
    const flags: TerraDrawSelectModeOptions["flags"] = {};
    drawableModes.forEach((mode) => {
      flags[mode] = {
        feature: {
          draggable: true,
          coordinates: {
            draggable: true,
            midpoints: {draggable: true},
            deletable: true
          }
        }
      };
    });
    return {
      allowManualDeselection: true,
      allowManualSelection: true,
      flags,
      pointerDistance: 30
    };
  }

  private removeDeletedSelections(deletedIds: unknown[] | undefined): void {
    if (!Array.isArray(deletedIds)) {
      return;
    }
    deletedIds.forEach((id) => {
      if (typeof id === "string" || typeof id === "number") {
        this.selectedFeatureIds.delete(id);
      }
    });
  }

  private getTerraDrawDependencies(): TerraDrawDependencies {
    if (!this.mapDeps) {
      return {};
    }
    const terraDraw = this.mapDeps.terraDraw as any;
    const terraDrawAdapter = this.mapDeps.terraDrawOpenLayersAdapter as any;
    return {
      TerraDrawCtor: terraDraw.TerraDraw,
      AdapterCtor: terraDrawAdapter.TerraDrawOpenLayersAdapter,
      PointMode: terraDraw.TerraDrawPointMode,
      PolygonMode: terraDraw.TerraDrawPolygonMode,
      LineStringMode: terraDraw.TerraDrawLineStringMode,
      RectangleMode: terraDraw.TerraDrawRectangleMode,
      SelectMode: terraDraw.TerraDrawSelectMode
    };
  }

  private createVectorSourceFromFeatureCollection(value: MapModelValueType): {source: OLVectorSource; features: any[]} {
    const geoJsonFormat = new this.mapDeps!.GeoJSON();
    const features = geoJsonFormat.readFeatures(value as any, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857"
    });
    return {
      source: new this.mapDeps!.VectorSource({features}),
      features
    };
  }

  private renderReadonlyLayer(value: MapModelValueType): void {
    if (!this.map || !this.mapDeps) {
      return;
    }
    this.removeFeatureLayer();
    const {source} = this.createVectorSourceFromFeatureCollection(value);
    this.vectorSource = source;
    this.featureLayer = new this.mapDeps.VectorLayer({
      source: this.vectorSource
    });
    this.map.addLayer(this.featureLayer);
    this.fitToLayerBounds();
  }

  private removeFeatureLayer(): void {
    if (this.featureLayer && this.map) {
      this.map.removeLayer(this.featureLayer);
    }
    this.featureLayer = undefined;
    this.vectorSource = undefined;
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
      this.map?.updateSize();
      if (this.vectorSource) {
        this.fitToLayerBounds();
      }
    });
    globalThis.setTimeout(() => {
      this.map?.updateSize();
      if (this.vectorSource) {
        this.fitToLayerBounds();
      }
    }, 0);
  }

  private fitToLayerBounds(): void {
    if (!this.map || !this.vectorSource || !this.mapDeps) {
      return;
    }
    const extent = this.vectorSource.getExtent();
    if (extent != null && !this.mapDeps.extentIsEmpty(extent)) {
      this.map.getView().fit(extent, {padding: [12, 12, 12, 12]});
    }
  }

  public isEditMode(): boolean {
    return this.getFormComponent.editMode() && !this.isReadonly;
  }
}
