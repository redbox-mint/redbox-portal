import {
    FormExpressionsConfig, FormConstraintConfig,
    FormConstraintConfigFrame, FormExpressionsConfigFrame, AllFieldModelDefinitionFrames,
     AllFieldLayoutDefinitionFrames,
    AllFieldModelDefinitions, AllFieldLayoutDefinitions,
    FormConfigItemVisitor, Visitee, AvailableFieldComponentDefinitions, AvailableFieldComponentDefinitionFrames
} from "..";

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
    model?: AllFieldModelDefinitionFrames;
    /**
     * The definition of the client-side component for the form field.
     */
    component: AvailableFieldComponentDefinitionFrames;
    /**
     * The definition of the client-side layout for this form field.
     */
    layout?: AllFieldLayoutDefinitionFrames;
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
}

/**
 * The form component abstract class is the base for each real component definition class.
 */
export abstract class FormComponentDefinition implements FormComponentDefinitionFrame, Visitee {
    public name: string;
    // Using definite assignment assertion operator (!) to say that component does not need to be set in the abstract class constructor.
    // The component property can't be set here, as FieldComponentDefinition is abstract there is no way to work out which class to use.
    // Subclasses set the component property with a new instance of the proper class.
    public component!: AvailableFieldComponentDefinitions;
    public model?: AllFieldModelDefinitions;
    public layout?: AllFieldLayoutDefinitions;
    public expressions?: FormExpressionsConfig;
    public module?: string;
    public constraints?: FormConstraintConfig;

    protected constructor(data: FormComponentDefinitionFrame) {
        Object.assign(this, data);
        this.name = data.name;
        this.constraints = new FormConstraintConfig(data.constraints)
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
