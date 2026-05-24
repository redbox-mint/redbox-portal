import { FieldModelConfig, FieldModelDefinition } from "../field-model.model";
import { FormComponentDefinition } from "../form-component.model";
import { FormConfigVisitorOutline } from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import { FieldComponentConfig, FieldComponentDefinition } from "../field-component.model";
import { AvailableFieldLayoutDefinitionOutlines } from "../dictionary.outline";
import {
    RecordMetadataDisplayComponentName,
    RecordMetadataDisplayFieldComponentConfigOutline,
    RecordMetadataDisplayFieldComponentDefinitionOutline,
    RecordMetadataDisplayFieldModelConfigOutline,
    RecordMetadataDisplayFieldModelDefinitionOutline,
    RecordMetadataDisplayFormComponentDefinitionOutline,
    RecordMetadataDisplayModelName,
    RecordMetadataDisplayRenderMode,
    RecordMetadataDisplayModelValueType,
    RecordMetadataDisplayTableColumn,
} from "./record-metadata-display.outline";

export class RecordMetadataDisplayFieldComponentConfig extends FieldComponentConfig implements RecordMetadataDisplayFieldComponentConfigOutline {
    template?: string;
    itemTemplate?: string;
    emptyContent = "";
    loadingContent = "Loading...";
    errorContent = "Unable to load related record";
    failedItemContent = "Unable to load record";
    renderMode: RecordMetadataDisplayRenderMode = "table";
    separator = ", ";
    tableColumns: RecordMetadataDisplayTableColumn[] = [
        { label: "Title", path: "metadata.title", fallback: "" },
        { label: "OID", path: "oid", fallback: "" }
    ];
    metadataAlias = "metadata";
    hasTemplate?: boolean;
    hasItemTemplate?: boolean;
}

export class RecordMetadataDisplayFieldComponentDefinition extends FieldComponentDefinition implements RecordMetadataDisplayFieldComponentDefinitionOutline {
    class = RecordMetadataDisplayComponentName;
    config?: RecordMetadataDisplayFieldComponentConfigOutline;

    async accept(visitor: FormConfigVisitorOutline) {
        await visitor.visitRecordMetadataDisplayFieldComponentDefinition(this);
    }
}

export class RecordMetadataDisplayFieldModelConfig extends FieldModelConfig<RecordMetadataDisplayModelValueType> implements RecordMetadataDisplayFieldModelConfigOutline {
    defaultValue: RecordMetadataDisplayModelValueType = null;
}

export class RecordMetadataDisplayFieldModelDefinition extends FieldModelDefinition<RecordMetadataDisplayModelValueType> implements RecordMetadataDisplayFieldModelDefinitionOutline {
    class = RecordMetadataDisplayModelName;
    config?: RecordMetadataDisplayFieldModelConfigOutline;

    async accept(visitor: FormConfigVisitorOutline) {
        await visitor.visitRecordMetadataDisplayFieldModelDefinition(this);
    }
}

export class RecordMetadataDisplayFormComponentDefinition extends FormComponentDefinition implements RecordMetadataDisplayFormComponentDefinitionOutline {
    public component!: RecordMetadataDisplayFieldComponentDefinitionOutline;
    public model?: RecordMetadataDisplayFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    async accept(visitor: FormConfigVisitorOutline) {
        await visitor.visitRecordMetadataDisplayFormComponentDefinition(this);
    }
}

export const RecordMetadataDisplayMap = [
    { kind: FieldComponentConfigKind, def: RecordMetadataDisplayFieldComponentConfig },
    { kind: FieldComponentDefinitionKind, def: RecordMetadataDisplayFieldComponentDefinition, class: RecordMetadataDisplayComponentName },
    { kind: FieldModelConfigKind, def: RecordMetadataDisplayFieldModelConfig },
    { kind: FieldModelDefinitionKind, def: RecordMetadataDisplayFieldModelDefinition, class: RecordMetadataDisplayModelName },
    { kind: FormComponentDefinitionKind, def: RecordMetadataDisplayFormComponentDefinition, class: RecordMetadataDisplayComponentName },
];

export const RecordMetadataDisplayDefaults = {
    [FormComponentDefinitionKind]: {
        [RecordMetadataDisplayComponentName]: {
            [FieldComponentDefinitionKind]: RecordMetadataDisplayComponentName,
            [FieldModelDefinitionKind]: RecordMetadataDisplayModelName,
        }
    }
};
