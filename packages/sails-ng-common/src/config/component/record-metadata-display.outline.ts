import {
    FieldComponentConfigFrameKindType,
    FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType,
    FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType,
    FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType,
    FormComponentDefinitionFrameKindType,
    FormComponentDefinitionKindType
} from "../shared.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline
} from "../field-component.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from "../form-component.outline";
import { AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines } from "../dictionary.outline";

export const RecordMetadataDisplayComponentName = "RecordMetadataDisplayComponent" as const;
export type RecordMetadataDisplayComponentNameType = typeof RecordMetadataDisplayComponentName;

export const RecordMetadataDisplayModelName = "RecordMetadataDisplayModel" as const;
export type RecordMetadataDisplayModelNameType = typeof RecordMetadataDisplayModelName;

export const RecordMetadataDisplayRenderModes = ["table", "list", "joined", "template"] as const;
export type RecordMetadataDisplayRenderMode = typeof RecordMetadataDisplayRenderModes[number];

export type RecordMetadataDisplayModelValueType = string | string[] | null;

export interface RecordMetadataDisplayTableColumn {
    label?: string;
    path?: string;
    template?: string;
    fallback?: string;
    hasTemplate?: boolean;
}

export interface RecordMetadataDisplayFieldComponentConfigFrame extends FieldComponentConfigFrame {
    template?: string;
    itemTemplate?: string;
    emptyContent?: string;
    loadingContent?: string;
    errorContent?: string;
    failedItemContent?: string;
    renderMode?: RecordMetadataDisplayRenderMode;
    separator?: string;
    tableColumns?: RecordMetadataDisplayTableColumn[];
    metadataAlias?: string;
    hasTemplate?: boolean;
    hasItemTemplate?: boolean;
}

export interface RecordMetadataDisplayFieldComponentConfigOutline extends RecordMetadataDisplayFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface RecordMetadataDisplayFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: RecordMetadataDisplayComponentNameType;
    config?: RecordMetadataDisplayFieldComponentConfigFrame;
}

export interface RecordMetadataDisplayFieldComponentDefinitionOutline extends RecordMetadataDisplayFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: RecordMetadataDisplayComponentNameType;
    config?: RecordMetadataDisplayFieldComponentConfigOutline;
}

export interface RecordMetadataDisplayFieldModelConfigFrame extends FieldModelConfigFrame<RecordMetadataDisplayModelValueType> {
}

export interface RecordMetadataDisplayFieldModelConfigOutline extends RecordMetadataDisplayFieldModelConfigFrame, FieldModelConfigOutline<RecordMetadataDisplayModelValueType> {
}

export interface RecordMetadataDisplayFieldModelDefinitionFrame extends FieldModelDefinitionFrame<RecordMetadataDisplayModelValueType> {
    class: RecordMetadataDisplayModelNameType;
    config?: RecordMetadataDisplayFieldModelConfigFrame;
}

export interface RecordMetadataDisplayFieldModelDefinitionOutline extends RecordMetadataDisplayFieldModelDefinitionFrame, FieldModelDefinitionOutline<RecordMetadataDisplayModelValueType> {
    class: RecordMetadataDisplayModelNameType;
    config?: RecordMetadataDisplayFieldModelConfigOutline;
}

export interface RecordMetadataDisplayFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: RecordMetadataDisplayFieldComponentDefinitionFrame;
    model?: RecordMetadataDisplayFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RecordMetadataDisplayFormComponentDefinitionOutline extends RecordMetadataDisplayFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: RecordMetadataDisplayFieldComponentDefinitionOutline;
    model?: RecordMetadataDisplayFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type RecordMetadataDisplayTypes =
    | { kind: FieldComponentConfigFrameKindType, class: RecordMetadataDisplayFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: RecordMetadataDisplayFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: RecordMetadataDisplayFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: RecordMetadataDisplayFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: RecordMetadataDisplayFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: RecordMetadataDisplayFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: RecordMetadataDisplayFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: RecordMetadataDisplayFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: RecordMetadataDisplayFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: RecordMetadataDisplayFormComponentDefinitionOutline };
