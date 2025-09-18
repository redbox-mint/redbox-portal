import {TemplateCompileInput} from "../template.model";

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

/**
 * The base form field definition.
 *
 * This is the basic structure used by component, model, and layout definitions.
 */
export interface BaseFormFieldDefinition {
    class: string;
    config?: object;

    /**
     * Get an array of the templates that need to be compiled.
     * Each item includes the key that identifies the item,
     * the raw value to be compiled, and the kind of template.
     */
    get getTemplateInfo(): TemplateCompileInput[];
}