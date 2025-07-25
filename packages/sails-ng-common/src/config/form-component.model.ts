import {FormFieldComponentDefinition, FormFieldLayoutDefinition, FormFieldModelDefinition} from "./component";


/**
 * The form component configuration definition.
 *
 */
export interface FormComponentDefinition {
    /**
     * top-level field name, applies to field and the component, etc.
     */
    name: string;
    /**
     * The definition of the model that backs the form field.
     */
    model: FormFieldModelDefinition;
    /**
     * The definition of the client-side component for the form field.
     */
    component: FormFieldComponentDefinition;
    /**
     * The definition of the client-side layout for this form field.
     */
    layout?: FormFieldLayoutDefinition;
    /**
     * A record with string keys and expression template values for defining expressions.
     *
     * TODO: 'template' is a lodash template for now, but it should become a function like FormValidatorDefinition.create.
     *   Expression functions will participate in a similar process as the validation functions to get to the client.
     */
    expressions?: ExpressionsConfig;
    /**
     * For a custom form component definition, module defines where to find the definition.
     */
    module?: string;
    /**
     * Constraints / prerequisites for this component to be included in the form definition.
     */
    constraints?: FormConstraintConfig;
}

export type ExpressionsConfig = Record<string, { template: string; condition?: any }>;

/**
 * The constraints that must be fulfilled for the form field to be included.
 */
export interface FormConstraintConfig {
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
    allowModes?: FormModesConfig[]
}

/**
 * The options available for the authorization constraints.
 */
export interface FormConstraintAuthorizationConfig {
    /**
     * The current user must have at least one of these roles for the form field to be included.
     *
     * e.g. allowRoles: ['Admin', 'Librarians'],
     */
    allowRoles?: string[];
}

/**
 * The available form modes.
 */
export type FormModesConfig  = "edit" | "view";
