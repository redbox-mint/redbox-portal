import {
    isBoolean as _isBoolean,
    isArray as _isArray,
    isString as _isString,
    isPlainObject as _isPlainObject,
    isObjectLike as _isObjectLike,
    isFunction as _isFunction,
    cloneDeep as _cloneDeep,
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

/**
 * Apply conventions to convert a value to a boolean.
 * @param value A value to convert to boolean.
 */
export function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return !Number.isNaN(value) && value !== 0;
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  const trueValues = ["true", "t", "1", "yes", "y", "on", "enable", "enabled"];
  return trueValues.includes(normalized);
}

/**
 * Check whether a 'check' array starts with a 'base' array.
 * Both arrays must have at least one element.
 * @param base The shorter array.
 * @param check The longer array.
 * @private
 */
export function arrayStartsWithArray(base: unknown[], check: unknown[]) {
  if (!base || !check) {
    return false;
  }
  if (base.length > check.length) {
    return false;
  }
  return base.every((value, index) => check[index] === value);
}

export type CloneDataOptionsOrder = "structuredClone"|"cloneDeep"|"jsonParseStringify";

/**
 * Do a deep / structured clone of data.
 *
 * This is needed because each clone approach has pros and cons, and different places have different trade-offs.
 * We don't want to repeat this logic in every place, particularly the try / catch.
 *
 * @param data The item to clone.
 * @param options The clone options.
 * @param options.order The clone approaches and the order to try them. Default ['structuredClone', 'cloneDeep'].
 * @param options.onAllErrorThrow True to throw an error if all clone approaches fail, false to return the original data. Default false.
 */
export function cloneData(
  data: unknown,
  options?: { order?: CloneDataOptionsOrder[], onAllErrorThrow?: boolean }
) {
  const order: CloneDataOptionsOrder[] = options?.order ?? ['structuredClone', 'cloneDeep'];
  const onAllErrorThrow = options?.onAllErrorThrow ?? false;

  if (order.length < 1) {
    throw new Error("Must provide at least one clone approach.");
  }

  const approaches = {
    "jsonParseStringify": {
      "approach": (data: unknown) => JSON.parse(JSON.stringify(data)),
      "errors": [],
    },
    "structuredClone": {"approach": structuredClone, "errors": ["DataCloneError"]},
    "cloneDeep": {"approach": _cloneDeep, "errors": []},
  }

  for (const [index, approachName] of order.entries()) {
    const approachInfo = approaches[approachName];
    const approach: (data: unknown) => unknown = approachInfo.approach;
    const errors: string[] = approachInfo.errors ?? [];

    try {
      return approach(data);
    } catch (err) {
      if (onAllErrorThrow && index === (order.length - 1)) {
        throw err;
      }
      if (errors.length === 0 || (errors.length > 0 && err instanceof Error && errors.includes(err.name))) {
        // expected error, continue
        console.warn(`Could not clone data with approach ${approachName}, trying next approach.`);
        continue;
      }
      throw err;
    }
  }

  if (onAllErrorThrow) {
    throw Error(`All of the clone approaches failed ${order}.`);
  } else {
    return data;
  }
}

/**
 * Extract all properties of the type T that are of the type U.
 */
export type ExtractPropertyNamesOfType<T, U> = { [K in keyof T]: T[K] extends U ? K : never }[keyof T];

/**
 * Extract all properties from each of the types in the union type T, where the properties are of type U.
 * This uses the distributive feature of conditional types (T extends T ? ...).
 */
export type ExtractPropertyNamesOfTypeFromTypeUnion<T, U> = T extends T ? ExtractPropertyNamesOfType<T, U> : never;

// TODO: consider trying to type the access to the config properties.
// type FormFieldComponentOrLayoutDefinitionConfig = FormFieldComponentOrLayoutDefinition['config'];
// type FormFieldComponentOrLayoutStringKeys = NonNullable<ExtractPropertyNamesOfTypeFromTypeUnion<
//   FormFieldComponentOrLayoutDefinitionConfig, string | undefined | null
// >>;
// type FormFieldComponentOrLayoutBooleanKeys = NonNullable<ExtractPropertyNamesOfTypeFromTypeUnion<
//   FormFieldComponentOrLayoutDefinitionConfig, boolean | undefined | null
// >>;
