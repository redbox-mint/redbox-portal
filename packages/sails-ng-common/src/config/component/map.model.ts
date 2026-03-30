import {FieldModelConfig, FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    MapComponentName,
    MapDrawingMode,
    MapFieldComponentConfigOutline,
    MapFieldComponentDefinitionOutline,
    MapFieldModelConfigOutline,
    MapFieldModelDefinitionOutline,
    MapFormComponentDefinitionOutline,
    MapModelName,
    MapModelValueType,
    MapTileLayerConfig
} from "./map.outline";

const DefaultFeatureCollection = {
    type: "FeatureCollection",
    features: []
} as MapModelValueType;

/* Map Component */

export class MapFieldComponentConfig extends FieldComponentConfig implements MapFieldComponentConfigOutline {
    center: [number, number] = [-24.67, 134.07];
    zoom = 4;
    mapHeight = "450px";
    tileLayers: MapTileLayerConfig[] = [];
    enabledModes: MapDrawingMode[] = ["point", "polygon", "linestring", "rectangle", "select"];
    enableImport = true;
    coordinatesHelp?: string;

    constructor() {
        super();
    }
}

export class MapFieldComponentDefinition extends FieldComponentDefinition implements MapFieldComponentDefinitionOutline {
    class = MapComponentName;
    config?: MapFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitMapFieldComponentDefinition(this);
    }
}

/* Map Model */

export class MapFieldModelConfig extends FieldModelConfig<MapModelValueType> implements MapFieldModelConfigOutline {
    defaultValue = DefaultFeatureCollection;

    constructor() {
        super();
    }
}

export class MapFieldModelDefinition extends FieldModelDefinition<MapModelValueType> implements MapFieldModelDefinitionOutline {
    class = MapModelName;
    config?: MapFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitMapFieldModelDefinition(this);
    }
}

/* Map Form Component */

export class MapFormComponentDefinition extends FormComponentDefinition implements MapFormComponentDefinitionOutline {
    public component!: MapFieldComponentDefinitionOutline;
    public model?: MapFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitMapFormComponentDefinition(this);
    }
}

export const MapMap = [
    {kind: FieldComponentConfigKind, def: MapFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: MapFieldComponentDefinition, class: MapComponentName},
    {kind: FieldModelConfigKind, def: MapFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: MapFieldModelDefinition, class: MapModelName},
    {kind: FormComponentDefinitionKind, def: MapFormComponentDefinition, class: MapComponentName},
];
export const MapDefaults = {
    [FormComponentDefinitionKind]: {
        [MapComponentName]: {
            [FieldComponentDefinitionKind]: MapComponentName,
            [FieldModelDefinitionKind]: MapModelName,
        }
    }
};
