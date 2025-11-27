import {CanVisit} from "./visitor/base.outline";
import {FieldModelDefinitionFrame, FieldModelDefinitionOutline} from "./field-model.outline";
import {FieldComponentDefinitionFrame, FieldComponentDefinitionOutline} from "./field-component.outline";
import {FormModesConfig} from "./shared.outline";
import {FieldLayoutDefinitionFrame, FieldLayoutDefinitionOutline} from "./field-layout.outline";
import {ComponentClassNamesType, LayoutClassNamesType, ModelClassNamesType} from "./dictionary.model";


/**
 * The expressions for a component.
 */
export interface FormExpressionsConfigFrame {
    [key: string]: {
        template: string;
        condition?: unknown;
    }
}

export interface FormExpressionsConfigOutline extends FormExpressionsConfigFrame {

}

export interface FormConstraintConfigFrame {
    /**
     * The current user must fulfill these authorization constraints.
     * This is only available on the server side.
     * These are checked first.
     */
    authorization?: FormConstraintAuthorizationConfigFrame;
    /**
     * This form field is included when the displayed form is in one of these modes.
     * If this is not specified, the form field will be included in all modes.
     */
    allowModes?: FormModesConfig[];
}

export interface FormConstraintConfigOutline extends FormConstraintConfigFrame {
    authorization?: FormConstraintAuthorizationConfigOutline;
}

export interface FormConstraintAuthorizationConfigFrame {
    /**
     * The current user must have at least one of these roles for the form field to be included.
     *
     * e.g. allowRoles: ['Admin', 'Librarians'],
     */
    allowRoles?: string[];
}

export interface FormConstraintAuthorizationConfigOutline extends FormConstraintAuthorizationConfigFrame {

}

/**
 * The classes to transform to for each item that requires a class.
 */
export type FormOverrideModeClassesConfig = {
    component?: ComponentClassNamesType;
    model?: ModelClassNamesType;
    layout?: LayoutClassNamesType;
}

/**
 * The form mode to class name mapping.
 */
export type FormOverrideModesClassConfig = Partial<{
    /**
     * Optional entries where the key is a form mode,
     * and the value is the class to use for each item that requires a class.
     */
    [key in FormModesConfig]: FormOverrideModeClassesConfig;
}>;

/**
 * The available options for overriding the form config.
 */
export interface FormOverrideConfigFrame {
    /**
     * Replace the form component name property value with the value of this property.
     */
    replaceName?: string;

    /**
     * When the form mode is the object key (one of the form modes), set the class as per the value object.
     */
    formModeClasses?: FormOverrideModesClassConfig;

    /**
     * The name of the reusable form config to insert in place of this element.
     */
    reusableFormName?: string;
}

export interface FormOverrideConfigOutline extends FormOverrideConfigFrame {

}

/**
 * The form component interface that provides typing for the object literal and schema.
 */
export interface FormComponentDefinitionFrame {
    /**
     * top-level field name, applies to field and the component, etc.
     */
    name: string;
    /**
     * The definition of the model that backs the form field.
     */
    model?: FieldModelDefinitionFrame<unknown>;
    /**
     * The definition of the client-side component for the form field.
     */
    component: FieldComponentDefinitionFrame;
    /**
     * The definition of the client-side layout for this form field.
     */
    layout?: FieldLayoutDefinitionFrame;
    /**
     * A record with string keys and expression template values for defining expressions.
     *
     * TODO: 'template' is a lodash template for now, but it should become a function like FormValidatorDefinition.create.
     *   Expression functions will participate in a similar process as the validation functions to get to the client.
     */
    expressions?: FormExpressionsConfigFrame;
    /**
     * For a custom form component definition, module defines where to find the definition.
     */
    module?: string;
    /**
     * Constraints / prerequisites for this component to be included in the form definition.
     */
    constraints?: FormConstraintConfigFrame;
    /**
     * Optional ways to extend or replace parts of the form config.
     */
    overrides?: FormOverrideConfigFrame;
}

export interface FormComponentDefinitionOutline extends FormComponentDefinitionFrame, CanVisit {
    model?: FieldModelDefinitionOutline<unknown>;
    component: FieldComponentDefinitionOutline;
    layout?: FieldLayoutDefinitionOutline;
    expressions?: FormExpressionsConfigOutline;
    constraints?: FormConstraintConfigOutline;
    overrides?: FormOverrideConfigOutline;
}

