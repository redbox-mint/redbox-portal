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

/* Form Component */

export const FormComponentDefinitionFrameKind = "FormComponentDefinitionFrameKind" as const;
export type FormComponentDefinitionFrameKindType = typeof FormComponentDefinitionFrameKind;
export const FormComponentDefinitionKind = "FormComponentDefinitionKind" as const;
export type FormComponentDefinitionKindType = typeof FormComponentDefinitionKind;

/* Form Field Component */

export const FieldComponentDefinitionFrameKind = "FieldComponentDefinitionFrameKind" as const;
export type FieldComponentDefinitionFrameKindType = typeof FieldComponentDefinitionFrameKind;
export const FieldComponentDefinitionKind = "FieldComponentDefinitionKind" as const;
export type FieldComponentDefinitionKindType = typeof FieldComponentDefinitionKind;

export const FieldComponentConfigFrameKind = "FieldComponentConfigFrameKind" as const;
export type FieldComponentConfigFrameKindType = typeof FieldComponentConfigFrameKind;
export const FieldComponentConfigKind = "FieldComponentConfigKind" as const;
export type FieldComponentConfigKindType = typeof FieldComponentConfigKind;

/* Form Field Model */

export const FieldModelDefinitionFrameKind = "FieldModelDefinitionFrameKind" as const;
export type FieldModelDefinitionFrameKindType = typeof FieldModelDefinitionFrameKind;
export const FieldModelDefinitionKind = "FieldModelDefinitionKind" as const;
export type FieldModelDefinitionKindType = typeof FieldModelDefinitionKind;

export const FieldModelConfigFrameKind = "FieldModelConfigFrameKind" as const;
export type FieldModelConfigFrameKindType = typeof FieldModelConfigFrameKind;
export const FieldModelConfigKind = "FieldModelConfigKind" as const;
export type FieldModelConfigKindType = typeof FieldModelConfigKind;

/* Form Field Layout */

export const FieldLayoutDefinitionFrameKind = "FieldLayoutDefinitionFrameKind" as const;
export type FieldLayoutDefinitionFrameKindType = typeof FieldLayoutDefinitionFrameKind;
export const FieldLayoutDefinitionKind = "FieldLayoutDefinitionKind" as const;
export type FieldLayoutDefinitionKindType = typeof FieldLayoutDefinitionKind;

export const FieldLayoutConfigFrameKind = "FieldLayoutConfigFrameKind" as const;
export type FieldLayoutConfigFrameKindType = typeof FieldLayoutConfigFrameKind;
export const FieldLayoutConfigKind = "FieldLayoutConfigKind" as const;
export type FieldLayoutConfigKindType = typeof FieldLayoutConfigKind;

/* All Form Kinds and Types */

export const AvailableFormKinds = [
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
export type AvailableFormKindTypes = typeof AvailableFormKinds[number];


// TODO: is this the right approach to providing common methods?
// export abstract class BaseForm {
//     protected static setIfAvailable(item, data, name): void {
//         if (data && Object.hasOwn(data, name) && data[name] !== undefined && name in data) {
//             item[name] = data[name];
//         }
//     }
// }

/**
 * The expressions for a component.
 */
export interface FormExpressionsConfigFrame {
    [key: string]: {
        template: string;
        condition?: unknown;
    }
}

export class FormExpressionsConfig implements FormExpressionsConfigFrame {
    [key: string]: { template: string; condition?: unknown; };
}

export interface FormConstraintConfigFrame {
    /**
     * The current user must fulfill these authorization constraints.
     * This is only available on the server side.
     * These are checked first.
     */
    authorization?: FormConstraintAuthorizationConfig;
    /**
     * This form field is included when the displayed form is in one of these modes.
     * If this is not specified, the form field will be included in all modes.
     */
    allowModes?: FormModesConfig[];
}

/**
 * The constraints that must be fulfilled for the form field to be included.
 */
export class FormConstraintConfig {
    authorization?: FormConstraintAuthorizationConfig;
    allowModes?: FormModesConfig[]
}

export interface FormConstraintAuthorizationConfigFrame {
    /**
     * The current user must have at least one of these roles for the form field to be included.
     *
     * e.g. allowRoles: ['Admin', 'Librarians'],
     */
    allowRoles?: string[];
}

/**
 * The options available for the authorization constraints.
 */
export class FormConstraintAuthorizationConfig implements FormConstraintAuthorizationConfigFrame {
    allowRoles?: string[];
}

/**
 * The available form modes.
 */
export const formModesConfig = ["edit", "view"] as const;
/**
 * The available form modes as a typescript type.
 */
export type FormModesConfig = typeof formModesConfig[number];
