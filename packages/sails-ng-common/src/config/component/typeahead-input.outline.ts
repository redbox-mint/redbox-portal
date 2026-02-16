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
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* Typeahead Input Component */
export const TypeaheadInputComponentName = "TypeaheadInputComponent" as const;
export type TypeaheadInputComponentNameType = typeof TypeaheadInputComponentName;

export type TypeaheadSourceType = "static" | "vocabulary" | "namedQuery";
export type TypeaheadValueMode = "value" | "optionObject";
export type TypeaheadStoredSourceType = TypeaheadSourceType | "freeText";

export interface TypeaheadOption {
    label: string;
    value: string;
    sourceType?: TypeaheadStoredSourceType;
    raw?: unknown;
}

export interface TypeaheadInputFieldComponentConfigFrame extends FieldComponentConfigFrame {
    sourceType?: TypeaheadSourceType;
    staticOptions?: TypeaheadOption[];
    vocabRef?: string;
    queryId?: string;
    labelField?: string;
    labelTemplate?: string;
    valueField?: string;
    minChars?: number;
    debounceMs?: number;
    maxResults?: number;
    allowFreeText?: boolean;
    valueMode?: TypeaheadValueMode;
    cacheResults?: boolean;
    multiSelect?: boolean;
    placeholder?: string;
    readOnlyAfterSelect?: boolean;
}

export interface TypeaheadInputFieldComponentConfigOutline extends TypeaheadInputFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface TypeaheadInputFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: TypeaheadInputComponentNameType;
    config?: TypeaheadInputFieldComponentConfigFrame;
}

export interface TypeaheadInputFieldComponentDefinitionOutline extends TypeaheadInputFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: TypeaheadInputComponentNameType;
    config?: TypeaheadInputFieldComponentConfigOutline;
}

/* Typeahead Input Model */
export const TypeaheadInputModelName = "TypeaheadInputModel" as const;
export type TypeaheadInputModelNameType = typeof TypeaheadInputModelName;

export interface TypeaheadInputModelOptionValue {
    label: string;
    value: string;
    sourceType?: TypeaheadStoredSourceType;
}

export type TypeaheadInputModelValueType = string | TypeaheadInputModelOptionValue | null;

export interface TypeaheadInputFieldModelConfigFrame extends FieldModelConfigFrame<TypeaheadInputModelValueType> {
}

export interface TypeaheadInputFieldModelConfigOutline extends TypeaheadInputFieldModelConfigFrame, FieldModelConfigOutline<TypeaheadInputModelValueType> {
}

export interface TypeaheadInputFieldModelDefinitionFrame extends FieldModelDefinitionFrame<TypeaheadInputModelValueType> {
    class: TypeaheadInputModelNameType;
    config?: TypeaheadInputFieldModelConfigFrame;
}

export interface TypeaheadInputFieldModelDefinitionOutline extends TypeaheadInputFieldModelDefinitionFrame, FieldModelDefinitionOutline<TypeaheadInputModelValueType> {
    class: TypeaheadInputModelNameType;
    config?: TypeaheadInputFieldModelConfigOutline;
}

/* Typeahead Input Form Component */
export interface TypeaheadInputFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: TypeaheadInputFieldComponentDefinitionFrame;
    model?: TypeaheadInputFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface TypeaheadInputFormComponentDefinitionOutline extends TypeaheadInputFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: TypeaheadInputFieldComponentDefinitionOutline;
    model?: TypeaheadInputFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type TypeaheadInputTypes =
    | { kind: FieldComponentConfigFrameKindType, class: TypeaheadInputFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: TypeaheadInputFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: TypeaheadInputFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: TypeaheadInputFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: TypeaheadInputFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: TypeaheadInputFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: TypeaheadInputFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: TypeaheadInputFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: TypeaheadInputFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: TypeaheadInputFormComponentDefinitionOutline }
    ;
