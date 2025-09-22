import {BaseFormFieldComponentDefinition, BaseFormFieldComponentDefinitionFrame} from "./form-field-component.model";
import {FormFieldModelDefinition, FormFieldModelDefinitionFrame} from "./form-field-model.model";
import {FormFieldLayoutDefinition, FormFieldLayoutDefinitionFrame} from "./form-field-layout.model";
import {FormExpressionsConfig, FormConstraintConfig} from "./shared.model";
import {FormConfigItemVisitor, Visitee} from "./visitor";

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
    model?: FormFieldModelDefinitionFrame<unknown>;
    /**
     * The definition of the client-side component for the form field.
     */
    component: BaseFormFieldComponentDefinitionFrame;
    /**
     * The definition of the client-side layout for this form field.
     */
    layout?: FormFieldLayoutDefinitionFrame;
    /**
     * A record with string keys and expression template values for defining expressions.
     *
     * TODO: 'template' is a lodash template for now, but it should become a function like FormValidatorDefinition.create.
     *   Expression functions will participate in a similar process as the validation functions to get to the client.
     */
    expressions?: FormExpressionsConfig;
    /**
     * For a custom form component definition, module defines where to find the definition.
     */
    module?: string;
    /**
     * Constraints / prerequisites for this component to be included in the form definition.
     */
    constraints?: FormConstraintConfig;
}

/**
 * The form component abstract class is the base for each real component definition class.
 */
export abstract class FormComponentDefinition implements FormComponentDefinitionFrame, Visitee {
    public name: string;
    public component: BaseFormFieldComponentDefinition;
    public model?: FormFieldModelDefinition<unknown>;
    public layout?: FormFieldLayoutDefinition;
    public expressions?: FormExpressionsConfig;
    public module?: string;
    public constraints?: FormConstraintConfig;

    protected constructor(data: FormComponentDefinitionFrame) {
        Object.assign(this, data);
        this.name = data.name;
        this.component = data.component;
    }

    abstract accept(visitor: FormConfigItemVisitor): void;
}

/**
 * An interface for classes that might have children.
 */
export interface HasChildren {
    /**
     * Get all the components that are directly contained by this component.
     */
    get children(): FormComponentDefinition[];
}
