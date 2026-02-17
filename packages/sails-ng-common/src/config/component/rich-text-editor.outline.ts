import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {
    FieldComponentConfigFrame, FieldComponentConfigOutline,
    FieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline
} from "../field-component.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType, FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType,
    FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";

/* Rich Text Editor Component */

export const RichTextEditorComponentName = "RichTextEditorComponent" as const;
export type RichTextEditorComponentNameType = typeof RichTextEditorComponentName;

export type RichTextEditorOutputFormatType = "html" | "markdown";

export interface RichTextEditorFieldComponentConfigFrame extends FieldComponentConfigFrame {
    outputFormat?: RichTextEditorOutputFormatType;
    showSourceToggle?: boolean;
    toolbar?: string[];
    minHeight?: string;
    placeholder?: string;
}

export interface RichTextEditorFieldComponentConfigOutline extends RichTextEditorFieldComponentConfigFrame, FieldComponentConfigOutline {
    outputFormat?: RichTextEditorOutputFormatType;
    showSourceToggle?: boolean;
    toolbar?: string[];
    minHeight?: string;
    placeholder?: string;
}

export interface RichTextEditorFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: RichTextEditorComponentNameType;
    config?: RichTextEditorFieldComponentConfigFrame;
}

export interface RichTextEditorFieldComponentDefinitionOutline extends RichTextEditorFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: RichTextEditorComponentNameType;
    config?: RichTextEditorFieldComponentConfigOutline;
}

/* Rich Text Editor Model */

export const RichTextEditorModelName = "RichTextEditorModel" as const;
export type RichTextEditorModelNameType = typeof RichTextEditorModelName;
export type RichTextEditorModelValueType = string;

export interface RichTextEditorFieldModelConfigFrame extends FieldModelConfigFrame<RichTextEditorModelValueType> {
}

export interface RichTextEditorFieldModelConfigOutline extends RichTextEditorFieldModelConfigFrame, FieldModelConfigOutline<RichTextEditorModelValueType> {
}

export interface RichTextEditorFieldModelDefinitionFrame extends FieldModelDefinitionFrame<RichTextEditorModelValueType> {
    class: RichTextEditorModelNameType;
    config?: RichTextEditorFieldModelConfigFrame;
}

export interface RichTextEditorFieldModelDefinitionOutline extends RichTextEditorFieldModelDefinitionFrame, FieldModelDefinitionOutline<RichTextEditorModelValueType> {
    class: RichTextEditorModelNameType;
    config?: RichTextEditorFieldModelConfigOutline;
}

/* Rich Text Editor Form Component */

export interface RichTextEditorFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: RichTextEditorFieldComponentDefinitionFrame;
    model?: RichTextEditorFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RichTextEditorFormComponentDefinitionOutline extends RichTextEditorFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: RichTextEditorFieldComponentDefinitionOutline;
    model?: RichTextEditorFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type RichTextEditorTypes =
    | { kind: FieldComponentConfigFrameKindType, class: RichTextEditorFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: RichTextEditorFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: RichTextEditorFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: RichTextEditorFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: RichTextEditorFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: RichTextEditorFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: RichTextEditorFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: RichTextEditorFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: RichTextEditorFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: RichTextEditorFormComponentDefinitionOutline }
    ;
