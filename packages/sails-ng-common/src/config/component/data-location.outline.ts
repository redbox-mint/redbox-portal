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
import {
    FileUploadAttachmentValue,
    FileUploadFieldComponentConfigFrame,
    FileUploadFieldComponentConfigOutline
} from "./file-upload.outline";

export const DataLocationComponentName = "DataLocationComponent" as const;
export type DataLocationComponentNameType = typeof DataLocationComponentName;

export const DataLocationModelName = "DataLocationModel" as const;
export type DataLocationModelNameType = typeof DataLocationModelName;

export interface DataLocationOption {
    value: string;
    label: string;
}

export interface DataLocationBaseValue {
    location: string;
    notes?: string;
    isc?: string;
}

export interface DataLocationUrlValue extends DataLocationBaseValue {
    type: "url";
}

export interface DataLocationPhysicalValue extends DataLocationBaseValue {
    type: "physical";
}

export interface DataLocationFileValue extends DataLocationBaseValue {
    type: "file";
}

export interface DataLocationAttachmentValue extends FileUploadAttachmentValue {
    type: "attachment";
    isc?: string;
}

export type DataLocationValueType =
    | DataLocationUrlValue
    | DataLocationPhysicalValue
    | DataLocationFileValue
    | DataLocationAttachmentValue;

export type DataLocationModelValueType = DataLocationValueType[];

export interface DataLocationFieldComponentConfigFrame extends FileUploadFieldComponentConfigFrame {
    notesEnabled?: boolean;
    iscEnabled?: boolean;
    iscHeader?: string;
    defaultSelect?: string;
    securityClassificationOptions?: DataLocationOption[];
    locationAddText?: string;
    typeHeader?: string;
    locationHeader?: string;
    notesHeader?: string;
    columns?: string[] | Record<string, unknown>[];
    editNotesButtonText?: string;
    editNotesTitle?: string;
    cancelEditNotesButtonText?: string;
    applyEditNotesButtonText?: string;
    editNotesCssClasses?: string;
    dataTypes?: DataLocationOption[];
    dataTypeLookup?: Record<string, string>;
    hideNotesForLocationTypes?: string[];
}

export interface DataLocationFieldComponentConfigOutline extends DataLocationFieldComponentConfigFrame, FileUploadFieldComponentConfigOutline {
}

export interface DataLocationFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: DataLocationComponentNameType;
    config?: DataLocationFieldComponentConfigFrame;
}

export interface DataLocationFieldComponentDefinitionOutline extends DataLocationFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: DataLocationComponentNameType;
    config?: DataLocationFieldComponentConfigOutline;
}

export interface DataLocationFieldModelConfigFrame extends FieldModelConfigFrame<DataLocationModelValueType> {
}

export interface DataLocationFieldModelConfigOutline extends DataLocationFieldModelConfigFrame, FieldModelConfigOutline<DataLocationModelValueType> {
}

export interface DataLocationFieldModelDefinitionFrame extends FieldModelDefinitionFrame<DataLocationModelValueType> {
    class: DataLocationModelNameType;
    config?: DataLocationFieldModelConfigFrame;
}

export interface DataLocationFieldModelDefinitionOutline extends DataLocationFieldModelDefinitionFrame, FieldModelDefinitionOutline<DataLocationModelValueType> {
    class: DataLocationModelNameType;
    config?: DataLocationFieldModelConfigOutline;
}

export interface DataLocationFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: DataLocationFieldComponentDefinitionFrame;
    model?: DataLocationFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface DataLocationFormComponentDefinitionOutline extends DataLocationFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: DataLocationFieldComponentDefinitionOutline;
    model?: DataLocationFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type DataLocationTypes =
    | { kind: FieldComponentConfigFrameKindType, class: DataLocationFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: DataLocationFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: DataLocationFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: DataLocationFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: DataLocationFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: DataLocationFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: DataLocationFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: DataLocationFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: DataLocationFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: DataLocationFormComponentDefinitionOutline };
