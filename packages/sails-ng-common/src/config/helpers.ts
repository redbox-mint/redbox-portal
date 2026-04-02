import {
    isBoolean as _isBoolean,
    isArray as _isArray,
    isString as _isString,
    isPlainObject as _isPlainObject,
    isObjectLike as _isObjectLike,
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

    // Check for custom Object.
    try {
        const valueInfo = valueProtoInfo(value);
        if (valueInfo.isObjectLike && valueInfo.isValueStringTagObject &&
            valueInfo.isValueProtoCtorFunc && !valueInfo.isValueProtoCtorFuncObj) {
            return "object";
        }
    } catch (err) {
        console.debug(`guessType custom object error with value '${value}': ${err}`);
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

    console.debug(`guessType unknown type for '${value}' info ${JSON.stringify(valueProtoInfo(value))}`);

    return "unknown";
}

function valueProtoInfo(value: any) {
    const isObjectLike = _isObjectLike(value);
    const isValueStringTagObject = Object.prototype.toString.call(value) === '[object Object]';
    const valuePrototypeCtor = Object.getPrototypeOf(value).constructor;
    const isValueProtoCtorFunc = typeof valuePrototypeCtor === 'function';
    const isValueProtoCtorFuncObj = Function.prototype.toString.call(valuePrototypeCtor) === Function.prototype.toString.call(Object);
    return {
        isObjectLike,
        isValueStringTagObject,
        valuePrototypeCtor,
        isValueProtoCtorFunc,
        isValueProtoCtorFuncObj,
    };
}
