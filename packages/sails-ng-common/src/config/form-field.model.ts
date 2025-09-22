import {FormConfigItemVisitor, Visitee} from "./visitor";


/**
 * The form field definition interface that provides typing for the object literal and schema.
 */
export interface FormFieldDefinitionFrame {
    /**
     * The class name as a string.
     *
     * Uses typescript discriminated unions to help enforce types.
     * Ref: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
     */
    class: string;

    /**
     * The configuration specific to the class of this form field.
     */
    config?: object;
}

/**
 * The base form field definition.
 *
 * This is the basic structure used by component, model, and layout definitions.
 */
export abstract class FormFieldDefinition implements FormFieldDefinitionFrame, Visitee {
    class: string;
    config?: object;

    protected constructor(data: FormFieldDefinitionFrame) {
        Object.assign(this, data);
        // Typescript can't yet use Object.assign to know that a property has been assigned in the constructor.
        this.class = data.class;
    }

    abstract accept(visitor: FormConfigItemVisitor): void;
}