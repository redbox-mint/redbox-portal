import {FormComponentDefinition} from "./form-component.model";
import {isBoolean as _isBoolean, isArray as _isArray, isString as _isString, isPlainObject as _isPlainObject} from "lodash";
import { DateTime } from 'luxon';

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

export function isFormFieldDefinition(item: unknown): item is { class: string, config?: object } {
    // use typescript narrowing to check the value
    // see: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
    // not using 'BaseFormFieldComponentDefinition' because it is too general -
    // it does not include the class and config
    const i = item as { class: string, config?: object };
    // note that 'config' can be null or object or not set
    return 'class' in i && guessType(i?.class) === 'string' &&
        (('config' in i && ["object", "null"].includes(guessType(i.config))) || i?.config === undefined);
}

export function  isFormComponentDefinition(item: unknown): item is FormComponentDefinition {
    // use typescript narrowing to check the value
    const i = item as FormComponentDefinition;
    // only name and component are required
    return 'name' in i && guessType(i?.name) === 'string' &&
        'component' in i && isFormFieldDefinition(i?.component);
}
