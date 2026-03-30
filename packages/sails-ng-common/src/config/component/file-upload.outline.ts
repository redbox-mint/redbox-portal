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

/* File Upload Component */
export const FileUploadComponentName = "FileUploadComponent" as const;
export type FileUploadComponentNameType = typeof FileUploadComponentName;

export type FileUploadSourceType = "dropbox" | "googleDrive" | "onedrive";

export interface FileUploadAttachmentValue {
    type: "attachment";
    location: string;
    uploadUrl: string;
    fileId: string;
    name: string;
    mimeType?: string;
    notes?: string;
    size?: number;
    pending?: boolean;
}

export type FileUploadModelValueType = FileUploadAttachmentValue[];

export interface FileUploadFieldComponentConfigFrame extends FieldComponentConfigFrame {
    restrictions?: Record<string, unknown>;
    enabledSources?: FileUploadSourceType[];
    companionUrl?: string;
    allowUploadWithoutSave?: boolean;
    uppyDashboardNote?: string;
    tusHeaders?: Record<string, string>;
}

export interface FileUploadFieldComponentConfigOutline extends FileUploadFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface FileUploadFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: FileUploadComponentNameType;
    config?: FileUploadFieldComponentConfigFrame;
}

export interface FileUploadFieldComponentDefinitionOutline extends FileUploadFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: FileUploadComponentNameType;
    config?: FileUploadFieldComponentConfigOutline;
}

/* File Upload Model */
export const FileUploadModelName = "FileUploadModel" as const;
export type FileUploadModelNameType = typeof FileUploadModelName;

export interface FileUploadFieldModelConfigFrame extends FieldModelConfigFrame<FileUploadModelValueType> {
}

export interface FileUploadFieldModelConfigOutline extends FileUploadFieldModelConfigFrame, FieldModelConfigOutline<FileUploadModelValueType> {
}

export interface FileUploadFieldModelDefinitionFrame extends FieldModelDefinitionFrame<FileUploadModelValueType> {
    class: FileUploadModelNameType;
    config?: FileUploadFieldModelConfigFrame;
}

export interface FileUploadFieldModelDefinitionOutline extends FileUploadFieldModelDefinitionFrame, FieldModelDefinitionOutline<FileUploadModelValueType> {
    class: FileUploadModelNameType;
    config?: FileUploadFieldModelConfigOutline;
}

/* File Upload Form Component */
export interface FileUploadFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: FileUploadFieldComponentDefinitionFrame;
    model?: FileUploadFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface FileUploadFormComponentDefinitionOutline extends FileUploadFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: FileUploadFieldComponentDefinitionOutline;
    model?: FileUploadFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type FileUploadTypes =
    | { kind: FieldComponentConfigFrameKindType, class: FileUploadFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: FileUploadFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: FileUploadFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: FileUploadFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: FileUploadFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: FileUploadFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: FileUploadFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: FileUploadFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: FileUploadFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: FileUploadFormComponentDefinitionOutline }
    ;
