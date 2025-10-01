/**
 * A property that can be one of a record with string keys and values,
 * a string, null, or undefined.
 */
export type KeyValueStringProperty = Record<string, string> | string | null | undefined;
/**
 * A property that can be one of a record with string keys and record values,
 * a string, null, or undefined.
 */
export type KeyValueStringNested = Record<string, KeyValueStringProperty> | string | null | undefined;
export const FormComponentDefinitionFrameKind = "FormComponentDefinitionFrameKind" as const;
export type FormComponentDefinitionFrameKindType = typeof FormComponentDefinitionFrameKind;
export const FormComponentDefinitionKind = "FormComponentDefinitionKind" as const;
export type FormComponentDefinitionKindType = typeof FormComponentDefinitionKind;
export const FieldComponentDefinitionFrameKind = "FieldComponentDefinitionFrameKind" as const;
export type FieldComponentDefinitionFrameKindType = typeof FieldComponentDefinitionFrameKind;
export const FieldComponentDefinitionKind = "FieldComponentDefinitionKind" as const;
export type FieldComponentDefinitionKindType = typeof FieldComponentDefinitionKind;
export const FieldComponentConfigFrameKind = "FieldComponentConfigFrameKind" as const;
export type FieldComponentConfigFrameKindType = typeof FieldComponentConfigFrameKind;
export const FieldComponentConfigKind = "FieldComponentConfigKind" as const;
export type FieldComponentConfigKindType = typeof FieldComponentConfigKind;
export const FieldModelDefinitionFrameKind = "FieldModelDefinitionFrameKind" as const;
export type FieldModelDefinitionFrameKindType = typeof FieldModelDefinitionFrameKind;
export const FieldModelDefinitionKind = "FieldModelDefinitionKind" as const;
export type FieldModelDefinitionKindType = typeof FieldModelDefinitionKind;
export const FieldModelConfigFrameKind = "FieldModelConfigFrameKind" as const;
export type FieldModelConfigFrameKindType = typeof FieldModelConfigFrameKind;
export const FieldModelConfigKind = "FieldModelConfigKind" as const;
export type FieldModelConfigKindType = typeof FieldModelConfigKind;
export const FieldLayoutDefinitionFrameKind = "FieldLayoutDefinitionFrameKind" as const;
export type FieldLayoutDefinitionFrameKindType = typeof FieldLayoutDefinitionFrameKind;
export const FieldLayoutDefinitionKind = "FieldLayoutDefinitionKind" as const;
export type FieldLayoutDefinitionKindType = typeof FieldLayoutDefinitionKind;
export const FieldLayoutConfigFrameKind = "FieldLayoutConfigFrameKind" as const;
export type FieldLayoutConfigFrameKindType = typeof FieldLayoutConfigFrameKind;
export const FieldLayoutConfigKind = "FieldLayoutConfigKind" as const;
export type FieldLayoutConfigKindType = typeof FieldLayoutConfigKind;

/**
 * All form and field kinds.
 */
export const AllFormFieldKinds = [
    FormComponentDefinitionFrameKind,
    FormComponentDefinitionKind,
    FieldComponentDefinitionFrameKind,
    FieldComponentDefinitionKind,
    FieldComponentConfigFrameKind,
    FieldComponentConfigKind,
    FieldModelDefinitionFrameKind,
    FieldModelDefinitionKind,
    FieldModelConfigFrameKind,
    FieldModelConfigKind,
    FieldLayoutDefinitionFrameKind,
    FieldLayoutDefinitionKind,
    FieldLayoutConfigFrameKind,
    FieldLayoutConfigKind,
] as const;

/**
 * All form and field kind types.
 */
export type AllFormFieldKindTypes = typeof AllFormFieldKinds[number];


/**
 * The available form modes.
 */
export const formModesConfig = ["edit", "view"] as const;
/**
 * The available form modes as a typescript type.
 */
export type FormModesConfig = typeof formModesConfig[number];