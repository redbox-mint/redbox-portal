import {FormFieldComponentDefinition, FormFieldLayoutDefinition, FormFieldModelDefinition} from "./component";


/**
 * The form component configuration definition.
 *
 */
export interface FormComponentDefinition<ValueType> {
    /**
     * top-level field name, applies to field and the component, etc.
     */
    name: string;
    /**
     * The definition of the model that backs the form field.
     */
    model: FormFieldModelDefinition<ValueType>;
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
    expressions?: Record<string, { template: string; condition?: any }>;
    /**
     * For a custom form component definition, module defines where to find the definition.
     */
    module?: string;
}
