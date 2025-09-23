

/**
 * A property that can be one of a record with string keys and values,
 * a string, null, or undefined.
 */
export type KeyValueStringProperty = Record<string, string> | string | null | undefined;

/**
 * A property that can be one of a record with string keys and record values,
 * a string, null, or undefined.
 */
export type KeyValueStringNested = Record<string,  KeyValueStringProperty> | string | null | undefined;

/* Form Component */

export const FormComponentDefinitionFrameKind = "FormComponentDefinitionFrameKind" as const;
export type FormComponentDefinitionFrameKindType = typeof FormComponentDefinitionFrameKind;
export const FormComponentDefinitionKind = "FormComponentDefinitionKind" as const;
export type FormComponentDefinitionKindType = typeof FormComponentDefinitionKind;

/* Form Field Component */

export const FormFieldComponentDefinitionFrameKind = "FormFieldComponentDefinitionFrameKind" as const;
export type FormFieldComponentDefinitionFrameKindType = typeof FormFieldComponentDefinitionFrameKind;
export const FormFieldComponentDefinitionKind = "FormFieldComponentDefinitionKind" as const;
export type FormFieldComponentDefinitionKindType = typeof FormFieldComponentDefinitionKind;

export const FormFieldComponentConfigFrameKind = "FormFieldComponentConfigFrameKind" as const;
export type FormFieldComponentConfigFrameKindType = typeof FormFieldComponentConfigFrameKind;
export const FormFieldComponentConfigKind = "FormFieldComponentConfigKind" as const;
export type FormFieldComponentConfigKindType = typeof FormFieldComponentConfigKind;

/* Form Field Model */

export const FormFieldModelDefinitionFrameKind = "FormFieldModelDefinitionFrameKind" as const;
export type FormFieldModelDefinitionFrameKindType = typeof FormFieldModelDefinitionFrameKind;
export const FormFieldModelDefinitionKind = "FormFieldModelDefinitionKind" as const;
export type FormFieldModelDefinitionKindType = typeof FormFieldModelDefinitionKind;

export const FormFieldModelConfigFrameKind = "FormFieldModelConfigFrameKind" as const;
export type FormFieldModelConfigFrameKindType = typeof FormFieldModelConfigFrameKind;
export const FormFieldModelConfigKind = "FormFieldModelConfigKind" as const;
export type FormFieldModelConfigKindType = typeof FormFieldModelConfigKind;

/* Form Field Layout */

export const FormFieldLayoutDefinitionFrameKind = "FormFieldLayoutDefinitionFrameKind" as const;
export type FormFieldLayoutDefinitionFrameKindType = typeof FormFieldLayoutDefinitionFrameKind;
export const FormFieldLayoutDefinitionKind = "FormFieldLayoutDefinitionKind" as const;
export type FormFieldLayoutDefinitionKindType = typeof FormFieldLayoutDefinitionKind;

export const FormFieldLayoutConfigFrameKind = "FormFieldLayoutConfigFrameKind" as const;
export type FormFieldLayoutConfigFrameKindType = typeof FormFieldLayoutConfigFrameKind;
export const FormFieldLayoutConfigKind = "FormFieldLayoutConfigKind" as const;
export type FormFieldLayoutConfigKindType = typeof FormFieldLayoutConfigKind;

/* All Form Kinds and Types */

export const AvailableFormKinds = [
    FormComponentDefinitionFrameKind,
    FormComponentDefinitionKind,
    FormFieldComponentDefinitionFrameKind,
    FormFieldComponentDefinitionKind,
    FormFieldComponentConfigFrameKind,
    FormFieldComponentConfigKind,
    FormFieldModelDefinitionFrameKind,
    FormFieldModelDefinitionKind,
    FormFieldModelConfigFrameKind,
    FormFieldModelConfigKind,
    FormFieldLayoutDefinitionFrameKind,
    FormFieldLayoutDefinitionKind,
    FormFieldLayoutConfigFrameKind,
    FormFieldLayoutConfigKind,
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
export type FormExpressionsConfig = Record<string, { template: string; condition?: any }>;

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

    constructor(data?: FormConstraintConfigFrame) {
        Object.assign(this,data ?? {});
        this.authorization = new FormConstraintAuthorizationConfig(data?.authorization);
    }
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
    constructor(data?: FormConstraintAuthorizationConfigFrame) {
        Object.assign(this, data ?? {});
    }
}

/**
 * The available form modes.
 */
export const formModesConfig = ["edit", "view"] as const;
/**
 * The available form modes as a typescript type.
 */
export type FormModesConfig = typeof formModesConfig[number];
