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

export const PDFListComponentName = "PDFListComponent" as const;
export type PDFListComponentNameType = typeof PDFListComponentName;

export const PDFListModelName = "PDFListModel" as const;
export type PDFListModelNameType = typeof PDFListModelName;

export interface RecordAttachment {
    label: string;
    dateUpdated: string;
    [key: string]: unknown;
}

export type PDFListModelValueType = RecordAttachment[];

export interface PDFListFieldComponentConfigFrame extends FieldComponentConfigFrame {
    startsWith?: string;
    showVersionColumn?: boolean;
    versionColumnValueField?: string;
    versionColumnLabelKey?: string;
    useVersionLabelForFileName?: boolean;
    downloadBtnLabel?: string;
    downloadPreviousBtnLabel?: string;
    downloadPrefix?: string;
    fileNameTemplate?: string;
}

export interface PDFListFieldComponentConfigOutline extends PDFListFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface PDFListFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: PDFListComponentNameType;
    config?: PDFListFieldComponentConfigFrame;
}

export interface PDFListFieldComponentDefinitionOutline extends PDFListFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: PDFListComponentNameType;
    config?: PDFListFieldComponentConfigOutline;
}

export interface PDFListFieldModelConfigFrame extends FieldModelConfigFrame<PDFListModelValueType> {
}

export interface PDFListFieldModelConfigOutline extends PDFListFieldModelConfigFrame, FieldModelConfigOutline<PDFListModelValueType> {
}

export interface PDFListFieldModelDefinitionFrame extends FieldModelDefinitionFrame<PDFListModelValueType> {
    class: PDFListModelNameType;
    config?: PDFListFieldModelConfigFrame;
}

export interface PDFListFieldModelDefinitionOutline extends PDFListFieldModelDefinitionFrame, FieldModelDefinitionOutline<PDFListModelValueType> {
    class: PDFListModelNameType;
    config?: PDFListFieldModelConfigOutline;
}

export interface PDFListFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: PDFListFieldComponentDefinitionFrame;
    model?: PDFListFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface PDFListFormComponentDefinitionOutline extends PDFListFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: PDFListFieldComponentDefinitionOutline;
    model?: PDFListFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type PDFListTypes =
    | { kind: FieldComponentConfigFrameKindType, class: PDFListFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: PDFListFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: PDFListFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: PDFListFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: PDFListFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: PDFListFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: PDFListFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: PDFListFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: PDFListFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: PDFListFormComponentDefinitionOutline };
