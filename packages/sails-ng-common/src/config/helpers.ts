import {FormComponentDefinition} from "./form-component.model";
import {
    isBoolean as _isBoolean,
    isArray as _isArray,
    isString as _isString,
    isPlainObject as _isPlainObject
} from "lodash";
import {DateTime} from 'luxon';
import {BaseFieldComponentDefinitionOutline} from "./base-field-component.outline";
import {FormComponentDefinitionOutline} from "./form-component.outline";

/**
 * Guess the type of the value.
 * @param value Guess the type of this value.
 * @private
 */
export function guessType(value: unknown): "array" | "object" | "boolean" | "string" | "timestamp" | "number" | "null" | "unknown" {
    if (value === null) {
        return "null";
    }

    if (_isBoolean(value)) {
        return "boolean";
    }

    if (Number.isFinite(value)) {
        return "number";
    }

    if (_isArray(value)) {
        return "array";
    }

    if (_isPlainObject(value)) {
        return "object";
    }

    // check for date
    const dateTimeFormats = [
        DateTime.fromISO,
        DateTime.fromRFC2822,
        DateTime.fromHTTP,
    ];
    try {
        for (const dateTimeFormat of dateTimeFormats) {
            const result = dateTimeFormat(value?.toString() ?? "");
            if (result && result.isValid) {
                return "timestamp";
            }
        }

    } catch (err) {
        console.debug(`guessType parse error with value '${value}' formats ${JSON.stringify(dateTimeFormats)}: ${err}`);
    }

    if (_isString(value)) {
        return "string";
    }

    return "unknown";
}

/**
 * Check if the item is a field component definition (it has 'class' and optional 'config' properties).
 * @param item
 */
export function isFormFieldDefinition(item: unknown): item is BaseFieldComponentDefinitionOutline {
    if (item === undefined || item === null) {
        throw new Error(`Item provided to isFormFieldDefinition was undefined or null.`);
    }
    // use typescript narrowing to check the value
    // see: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
    // not using 'BaseFormFieldComponentDefinition' because it is too general -
    // it does not include the class and config
    const i = item as { class: string, config?: object };
    // note that 'config' can be null or object or not set
    return 'class' in i && guessType(i?.class) === 'string' &&
        (('config' in i && ["object", "null"].includes(guessType(i.config))) || i?.config === undefined);
}

/**
 * Check if the item is a form component definition (it has 'name' and 'component' properties).
 * @param item
 */
export function isFormComponentDefinition(item: unknown): item is FormComponentDefinitionOutline {
    if (item === undefined || item === null) {
        return false;
    }
    // use typescript narrowing to check the value
    const i = item as FormComponentDefinition;
    // only name and component are required
    const hasName = 'name' in i;
    const hasExpectedNameValue = ["null", "string"].includes(guessType(i?.name));
    const hasComponent = 'component' in i;
    const isFormFieldComponent = isFormFieldDefinition(i?.component);
    return hasName && hasExpectedNameValue && hasComponent && isFormFieldComponent;
}
