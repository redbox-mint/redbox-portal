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
import type { HistoricalVocabMode } from "./dropdown-input.outline";

/* Typeahead Input Component */
export const TypeaheadInputComponentName = "TypeaheadInputComponent" as const;
export type TypeaheadInputComponentNameType = typeof TypeaheadInputComponentName;

export const TypeaheadSourceTypes = ["static", "vocabulary", "namedQuery", "external", "service"] as const;
export type TypeaheadSourceType = typeof TypeaheadSourceTypes[number];
export type TypeaheadValueMode = "value" | "optionObject";
export type TypeaheadStoredSourceType = TypeaheadSourceType | "freeText";
/**
 * Maps stored object property names to paths on the selected option/raw result.
 * Use this only with valueMode: "optionObject" when a form needs a domain-specific
 * stored object, for example { dc_title: "dc_title", grant_number: "grant_number" }.
 * When omitted, optionObject mode keeps the legacy label/value/sourceType shape.
 */
export type TypeaheadOptionObjectFields = Record<string, string>;

export interface TypeaheadOption {
    label: string;
    value: string;
    sourceType?: TypeaheadStoredSourceType;
    /**
     * Indicates the option came from a historical/deprecated vocabulary entry.
     * This source metadata is preserved even when the option remains selectable.
     */
    historical?: boolean;
    /**
     * Indicates the option should be shown but cannot be selected in the current UI state.
     * Historical vocabulary values are disabled in `historicalVocabMode: 'disable'`, but
     * non-historical options may also be disabled for unrelated reasons.
     */
    disabled?: boolean;
    raw?: unknown;
}

export interface TypeaheadInputFieldComponentConfigCommonFrame extends FieldComponentConfigFrame {
    /**
     * Static options are required for sourceType: "static"; remote configs may
     * still carry an empty array from older defaults, so this remains common.
     */
    staticOptions?: TypeaheadOption[];
    labelField?: string;
    labelTemplate?: string;
    valueField?: string;
    minChars?: number;
    debounceMs?: number;
    maxResults?: number;
    requireSelection?: boolean;
    /**
     * "value" stores the selected option value as a string.
     * "optionObject" stores an object. Without optionObjectFields that object is
     * { label, value, sourceType }; with optionObjectFields it uses the configured
     * persisted property names and source paths.
     */
    valueMode?: TypeaheadValueMode;
    optionObjectFields?: TypeaheadOptionObjectFields;
    cacheResults?: boolean;
    multiSelect?: boolean;
    placeholder?: string;
    readOnlyAfterSelect?: boolean;
    historicalVocabMode?: HistoricalVocabMode;
}

export interface TypeaheadStaticSourceConfigFrame extends TypeaheadInputFieldComponentConfigCommonFrame {
    sourceType?: "static";
}

export interface TypeaheadVocabularySourceConfigFrame extends TypeaheadInputFieldComponentConfigCommonFrame {
    sourceType: "vocabulary";
    vocabRef?: string;
}

export interface TypeaheadNamedQuerySourceConfigFrame extends TypeaheadInputFieldComponentConfigCommonFrame {
    sourceType: "namedQuery";
    queryId?: string;
}

export interface TypeaheadExternalSourceConfigFrame extends TypeaheadInputFieldComponentConfigCommonFrame {
    sourceType: "external";
    provider?: string;
    resultArrayProperty?: string;
}

export interface TypeaheadServiceSourceConfigFrame extends TypeaheadInputFieldComponentConfigCommonFrame {
    sourceType: "service";
    serviceId?: string;
}

/**
 * Source-specific config shape for TypeScript-authored forms. The source-specific
 * IDs remain optional so runtime validator tests can still exercise missing config.
 */
export type TypeaheadInputSourceConfigFrame =
    | TypeaheadStaticSourceConfigFrame
    | TypeaheadVocabularySourceConfigFrame
    | TypeaheadNamedQuerySourceConfigFrame
    | TypeaheadExternalSourceConfigFrame
    | TypeaheadServiceSourceConfigFrame;

/**
 * The public config frame uses sourceType as a discriminant while keeping required
 * source values runtime-validated for JSON, migrated, and intentionally invalid forms.
 */
export type TypeaheadInputFieldComponentConfigFrame = TypeaheadInputSourceConfigFrame;

export type TypeaheadInputFieldComponentConfigOutline =
    TypeaheadInputFieldComponentConfigFrame & FieldComponentConfigOutline;

/**
 * Runtime defaults stay permissive because the constructed config class has to
 * carry every possible source property before a concrete sourceType is known.
 */
export interface TypeaheadInputPermissiveFieldComponentConfigOutline extends TypeaheadInputFieldComponentConfigCommonFrame, FieldComponentConfigOutline {
    sourceType?: TypeaheadSourceType;
    vocabRef?: string;
    queryId?: string;
    serviceId?: string;
    provider?: string;
    resultArrayProperty?: string;
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
    label?: string;
    value?: string;
    sourceType?: TypeaheadStoredSourceType;
    /**
     * Allows configured object-mode fields such as dc_title/grant_number while
     * keeping backwards compatibility with legacy label/value/sourceType objects.
     */
    [key: string]: unknown;
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
