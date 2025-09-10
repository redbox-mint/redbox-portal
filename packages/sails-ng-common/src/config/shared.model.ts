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
 * The base form field definition for each property
 * that specifies a class and config.
 */
export interface BaseFormFieldDefinition {
    class: string;
    config?: object;
}