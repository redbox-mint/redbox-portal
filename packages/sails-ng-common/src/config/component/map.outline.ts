import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* Map Component */
export const MapComponentName = "MapComponent" as const;
export type MapComponentNameType = typeof MapComponentName;

export interface MapFeatureGeometry {
    type: string;
    coordinates?: unknown;
}

export interface MapFeature {
    type: "Feature";
    id?: string | number;
    geometry: MapFeatureGeometry | null;
    properties?: Record<string, unknown> | null;
}

export interface MapFeatureCollection {
    type: "FeatureCollection";
    features: MapFeature[];
}

export type MapModelValueType = MapFeatureCollection;
export type MapDrawingMode = "point" | "polygon" | "linestring" | "rectangle" | "select";

export interface MapTileLayerConfig {
    name: string;
    url: string;
    options?: Record<string, unknown>;
}

export interface MapFieldComponentConfigFrame extends FieldComponentConfigFrame {
    center?: [number, number];
    zoom?: number;
    mapHeight?: string;
    tileLayers?: MapTileLayerConfig[];
    enabledModes?: MapDrawingMode[];
    enableImport?: boolean;
    coordinatesHelp?: string;
}

export interface MapFieldComponentConfigOutline extends MapFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface MapFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: MapComponentNameType;
    config?: MapFieldComponentConfigFrame;
}

export interface MapFieldComponentDefinitionOutline extends MapFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: MapComponentNameType;
    config?: MapFieldComponentConfigOutline;
}

/* Map Model */
export const MapModelName = "MapModel" as const;
export type MapModelNameType = typeof MapModelName;

export interface MapFieldModelConfigFrame extends FieldModelConfigFrame<MapModelValueType> {
}

export interface MapFieldModelConfigOutline extends MapFieldModelConfigFrame, FieldModelConfigOutline<MapModelValueType> {
}

export interface MapFieldModelDefinitionFrame extends FieldModelDefinitionFrame<MapModelValueType> {
    class: MapModelNameType;
    config?: MapFieldModelConfigFrame;
}

export interface MapFieldModelDefinitionOutline extends MapFieldModelDefinitionFrame, FieldModelDefinitionOutline<MapModelValueType> {
    class: MapModelNameType;
    config?: MapFieldModelConfigOutline;
}

/* Map Form Component */
export interface MapFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: MapFieldComponentDefinitionFrame;
    model?: MapFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface MapFormComponentDefinitionOutline extends MapFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: MapFieldComponentDefinitionOutline;
    model?: MapFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type MapTypes =
    | { kind: FieldComponentConfigFrameKindType, class: MapFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: MapFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: MapFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: MapFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: MapFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: MapFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: MapFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: MapFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: MapFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: MapFormComponentDefinitionOutline }
    ;
