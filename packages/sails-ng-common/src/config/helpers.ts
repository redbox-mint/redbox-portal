import {
    isBoolean as _isBoolean,
    isArray as _isArray,
    isString as _isString,
    isPlainObject as _isPlainObject,
    isFunction as _isFunction,
} from "lodash";
import {DateTime} from 'luxon';

export type GuessedType = "null"
    | "undefined"
    | "boolean"
    | "number"
    | "array"
    | "object"
    | "function"
    | "timestamp"
    | "string"
    | "unknown";

/**
 * Guess the type of the value.
 * @param value Guess the type of this value.
 * @private
 */
export function guessType(value: unknown): GuessedType {
    if (value === null) {
        return "null";
    }
    if (value === undefined) {
        return "undefined";
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

    if (_isFunction(value)) {
        return "function";
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
