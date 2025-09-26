import {CanVisit} from "./visitor/base.outline";

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
export interface FieldDefinitionOutline extends FieldDefinitionFrame, CanVisit {

}