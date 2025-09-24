import {IFormConfigVisitor, Visitee} from "./visitor/base.structure";


/**
 * The form field definition interface that provides typing for the object literal and schema.
 */
export interface FieldDefinitionFrame {
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
export abstract class FieldDefinition implements FieldDefinitionFrame, Visitee {
    abstract class: string;
    abstract config?: object;

    abstract accept(visitor: IFormConfigVisitor): void;
}