import {arrayEqualsArray} from "./config/helpers";

// This approach is similar to pino-redact: https://getpino.io/#/docs/redaction

/**
 * The available actions to take when processing a property.
 *
 * - replace: use another value instead of the current value
 * - delete: remove the object property key, remove array element, otherwise use 'undefined'
 * - throw: throw an error when an element matches
 * - ignore: do nothing and continue without changes
 */
type ProcessDataPropertyAction = "replace" | "delete" | "throw" | "ignore";

/**
 * The types of properties that can be processed.
 *
 * - sensitive: a value that should not be revealed in some situations
 * - circular: a value that references another part of the structure that leads to a infinite loop if followed
 * - function: a value that is a function
 */
type ProcessDataPropertyType = "sensitive" | "circular" | "function";

/**
 * The property path indicating how to access array elements and object properties.
 *
 * Strings are key names or an array index number as a string.
 * Numbers are array indexes.
 */
type ProcessDataPropertyPath = (string | number)[];

/**
 * The path for an element.
 */
type ProcessDataPropertyPathBaseElement = {
  /**
   * The optional property path to match.
   */
  path: ProcessDataPropertyPath
}

/**
 * The default action for a type.
 */
type ProcessDataPropertyGeneralDefaultElement = {
  /**
   * The action to take.
   */
  action: Omit<ProcessDataPropertyAction, "replace">,
  /**
   * The type of property.
   */
  type: ProcessDataPropertyType,
}

/**
 * One element defining the action to be taken and the type of property.
 * Optionally includes the path to the property.
 */
type ProcessDataPropertyGeneralElement = ProcessDataPropertyGeneralDefaultElement & ProcessDataPropertyPathBaseElement;

/**
 * The default replacement value for a type.
 */
type ProcessDataPropertyReplaceDefaultElement = {
  /**
   * The action to take.
   */
  action: "replace",
  /**
   * The type of property.
   */
  type: ProcessDataPropertyType,
  /**
   * The value to use when the action is 'replace'.
   */
  replaceValue?: unknown,
}

/**
 * One element defining the action to be taken and the type of property.
 * Optionally includes the path to the property and the replacement value.
 */
type ProcessDataPropertyReplaceElement = ProcessDataPropertyReplaceDefaultElement & ProcessDataPropertyPathBaseElement;

/**
 * One element defining the default action to be taken and the type of property.
 */
type ProcessDataPropertyDefaultElement =
  ProcessDataPropertyGeneralDefaultElement
  | ProcessDataPropertyReplaceDefaultElement;

/**
 * One element defining the action to be taken, the type of property, and the path.
 */
type ProcessDataPropertyPathElement = ProcessDataPropertyGeneralElement | ProcessDataPropertyReplaceElement;

/**
 * An element defining the action to take or null to indicate nothing to do.
 */
type ProcessDataPropertyElement = ProcessDataPropertyDefaultElement | ProcessDataPropertyPathElement | null;

/**
 * A custom function to assess a property path, value, and whether the value has already been seen.
 * @param value The property value.
 * @param path The property path in the root item.
 * @param elements The elements to be considered in addition to the custom processing this function implements.
 * @param seen The values that have already been seen.
 * @return An element defining the action to take or null to indicate nothing to do.
 */
type ProcessDataPropertyFunctionElement = (
  value: unknown, path: ProcessDataPropertyPath, elements?: ProcessDataPropertyElement[], seen?: WeakSet<object>
) => ProcessDataPropertyElement;

/**
 * The processing configuration options.
 */
type ProcessDataPropertyOptions = {
  /**
   * The elements to use for processing.
   * Default empty array.
   */
  elements?: (ProcessDataPropertyElement | ProcessDataPropertyFunctionElement)[];
  /**
   * Whether to modify the value directly (true) or create a new value (false).
   * Default false.
   */
  modifyValue?: boolean,
};

/*
 * Utility functions.
 */

function buildProcessDataPropertySensitiveElement(pattern: RegExp): ProcessDataPropertyFunctionElement {
  return function (
    value: unknown, path: ProcessDataPropertyPath, elements?: ProcessDataPropertyElement[]
  ): ProcessDataPropertyElement {
    if (typeof value !== 'string') {
      return null;
    }

    // Use provided element with exact path match first, otherwise match with no path.
    const element = elements?.find(e =>
        e?.type === "sensitive" && 'path' in e && Array.isArray(e.path) && arrayEqualsArray(e.path, path)
      )
      ?? elements?.find(e => e?.type === "sensitive");

    const norm = value.trim();
    if (pattern.test(norm)) {
      // default to replace with null
      return {
        action: element?.action ?? "replace",
        type: "sensitive",
        replaceValue: ((element && 'replaceValue' in element) ? element?.replaceValue : null) ?? null,
        path: path,
      }
    }
    return null;
  }
}

function getMatchingElement(elements?: ProcessDataPropertyElement[], filters?: {
  type?: ProcessDataPropertyType, path?: ProcessDataPropertyPath,
}): ProcessDataPropertyElement {
  if (!filters || (!filters.type && !filters.path)) {
    return null;
  }
  return elements?.find(e =>
      (filters?.type && e?.type === filters?.type) &&
      (filters?.path && 'path' in e && Array.isArray(e.path) && arrayEqualsArray(e.path, filters?.path))
    )
    ?? elements?.find(e => (filters?.type && e?.type === filters?.type))
    ?? null;
}

/*
 * The available elements.
 */

const processDataPropertyReplaceSensitiveElement: ProcessDataPropertyDefaultElement = {
  action: "replace",
  type: "sensitive",
  replaceValue: "[REDACTED]",
}

const processDataPropertyReplaceCircularElement: ProcessDataPropertyDefaultElement = {
  action: "replace",
  type: "circular",
  replaceValue: "[CIRCULAR]",
}

const processDataPropertyDeleteCircularElement: ProcessDataPropertyDefaultElement = {
  action: "delete",
  type: "circular",
}

const processDataPropertyDeleteFunctionElement: ProcessDataPropertyDefaultElement = {
  action: "delete",
  type: "function",
}

const processDataPropertyJwtValueSensitiveElement: ProcessDataPropertyFunctionElement =
  buildProcessDataPropertySensitiveElement(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

const processDataPropertyAuthBearerValueSensitiveElement: ProcessDataPropertyFunctionElement =
  buildProcessDataPropertySensitiveElement(/^Bearer\s+/i);

const processDataPropertyUrlCredentialValueSensitiveElement: ProcessDataPropertyFunctionElement =
  buildProcessDataPropertySensitiveElement(/\/\/[^:\s]+:[^@\s]+@/);

const processDataPropertySKApiTokenValueSensitiveElement: ProcessDataPropertyFunctionElement =
  buildProcessDataPropertySensitiveElement(/^(sk_live_|sk_test_)[A-Za-z0-9]+$/);

const processDataPropertyCookieKeySensitiveElement: ProcessDataPropertyFunctionElement = function (
  value: unknown, path: ProcessDataPropertyPath, elements?: ProcessDataPropertyElement[]
): ProcessDataPropertyElement {
  if (typeof value !== 'string') {
    return null;
  }

  // Use provided element with exact path match first, otherwise match with no path.
  const element = getMatchingElement(elements, {type: "sensitive", path: path});

  // replace based on key names
  if (path.length > 0) {
    const lastPart = path[path.length - 1]?.toString()?.toLowerCase();
    const secondLastPart = path[path.length - 2]?.toString()?.toLowerCase();
    const recognised = lastPart === 'cookie' || secondLastPart === 'cookies';
    if (recognised) {
      // default to replace with null
      return {
        action: element?.action ?? "replace",
        type: "sensitive",
        replaceValue: ((element && 'replaceValue' in element) ? element?.replaceValue : null) ?? null,
        path: path,
      }
    }
  }
  return null;
};

const processDataPropertyCredentialKeySensitiveElement: ProcessDataPropertyFunctionElement = function (
  value: unknown, path: ProcessDataPropertyPath, elements?: ProcessDataPropertyElement[]
): ProcessDataPropertyElement {
  if (typeof value !== 'string') {
    return null;
  }

  // Use provided element with exact path match first, otherwise match with no path.
  const element = getMatchingElement(elements, {type: "sensitive", path: path});

  // replace based on key names
  if (path.length > 0) {
    const lastPart = path[path.length - 1]?.toString()?.toLowerCase();
    const recognised = lastPart === 'authorization' || lastPart.includes('password');
    if (recognised) {
      // default to replace with null
      return {
        action: element?.action ?? "replace",
        type: "sensitive",
        replaceValue: ((element && 'replaceValue' in element) ? element?.replaceValue : null) ?? null,
        path: path,
      }
    }
  }
  return null;
};

const processDataPropertyHeaderForwardedKeySensitiveElement: ProcessDataPropertyFunctionElement = function (
  value: unknown, path: ProcessDataPropertyPath, elements?: ProcessDataPropertyElement[]
): ProcessDataPropertyElement {
  if (typeof value !== 'string') {
    return null;
  }

  // Use provided element with exact path match first, otherwise match with no path.
  const element = getMatchingElement(elements, {type: "sensitive", path: path});

  // replace based on key names
  if (path.length > 0) {
    const lastPart = path[path.length - 1]?.toString()?.toLowerCase();
    const recognised = lastPart.startsWith('x-forwarded-');
    if (recognised) {
      // default to replace with null
      return {
        action: element?.action ?? "replace",
        type: "sensitive",
        replaceValue: ((element && 'replaceValue' in element) ? element?.replaceValue : null) ?? null,
        path: path,
      }
    }
  }
  return null;
};

/*
 * Generic processing.
 */

function hasAnyOpts(opts?: ProcessDataPropertyOptions): boolean {
  const optElements = opts?.elements ?? [];
  const optModifyValue = opts?.modifyValue;
  return optElements.length > 0 || optModifyValue !== undefined;
}

/**
 * Process an item according to the provided options.
 * Modifies the value.
 * @param value The item to process.
 * @param elements The elements for the processing.
 * @param path The current path in the root item.
 * @param seen The values that have already been seen.
 * @return The item after processing.
 */
function processDataPropertiesModifyValue(
  value: unknown, elements: ProcessDataPropertyOptions['elements'], path: ProcessDataPropertyPath, seen: WeakSet<object>
): unknown {
  if (!hasAnyOpts(opts)) {
    return value;
  }
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'object') {
    seen.add(value);
  }

  // array
  if (Array.isArray(value)) {
    processDataPropertyArrayStep(value, opts, path, seen);
    return value;
  }

  // object
  if (typeof value === 'object') {
    processDataPropertyObjectStep(value, opts, path, seen);
    for (const [key, value] of Object.entries(value)) {
      const keyPath = [...path, key];
      processDataPropertyObjectStep(
        value, key, value, opts, keyPath, seen
      );
    }
    return value;
  }

  // not array and not object
  const container = {value};
  processDataPropertyValueStep(
    container, 'value', value, opts, [...path, 'value'], seen
  );
  if ('value' in container) {
    return container.value;
  }

  return undefined;
}

/**
 * Process an item according to the provided options.
 * Returns a new, processed, value.
 * @param value The item to process.
 * @param elements The elements for the processing.
 * @param path The current path in the root item.
 * @param seen The values that have already been seen.
 * @return The item after processing.
 */
function processDataPropertiesNewValue(
  value: unknown, elements: ProcessDataPropertyOptions['elements'], path: ProcessDataPropertyPath, seen: WeakSet<object>
): unknown {
  return value;
}

/*
 * Combinations of elements for specific use cases.
 */

/**
 * Redact known sensitive values from a request or response data structure.
 * @param value The original value.
 */
export function redactSensitiveValuesFromRequest(value: unknown) {
  const elements = [
    processDataPropertyReplaceSensitiveElement,
    processDataPropertyReplaceCircularElement,

    processDataPropertyJwtValueSensitiveElement,
    processDataPropertyAuthBearerValueSensitiveElement,
    processDataPropertyUrlCredentialValueSensitiveElement,
    processDataPropertySKApiTokenValueSensitiveElement,

    processDataPropertyCookieKeySensitiveElement,
    processDataPropertyCredentialKeySensitiveElement,
    processDataPropertyHeaderForwardedKeySensitiveElement,
  ];
  return processDataPropertiesModifyValue(value, elements, [], new WeakSet<object>());
}

/**
 * Prepare a value for jsonata processing by removing functions and removing keys with circular reference values.
 * @param value The original value.
 */
export function prepareValueForJsonata(value: unknown): unknown {
  const elements = [
    processDataPropertyDeleteCircularElement,
    processDataPropertyDeleteFunctionElement,
  ];
  return processDataPropertiesNewValue(value, elements, [], new WeakSet<object>());
}


// TODO

function processDataPropertyArrayStep(
  item: unknown[], opts: ProcessDataPropertyOptions, path: ProcessDataPropertyPath, seen: WeakSet<object>
): void {
  const element = processDataProperty(value, opts, path, seen);
  switch (element?.action) {
    case "throw":
      throw new Error(`Data property action: ${JSON.stringify(element)}`);

    case "delete":
      if (Array.isArray(item) && typeof key === 'number') {
        item.splice(key, 1, [undefined]);
      } else if (typeof item === 'object') {
        delete (item as Record<string, unknown>)[key];
      } else {
        throw new Error(`Data property action is invalid: ${JSON.stringify({element, key})}`);
      }
      break;

    case "replace":
      if (Array.isArray(item) && typeof key === 'number') {
        item.splice(key, 1, [element.replaceValue]);
      } else if (typeof item === 'object') {
        (item as Record<string, unknown>)[key] = element.replaceValue;
      } else {
        throw new Error(`Data property action is invalid: ${JSON.stringify({element, key})}`);
      }
      break;

    case "ignore":
      if (Array.isArray(item) && typeof key === 'number') {
        item[key] = processDataPropertiesStep(value, opts, path, seen);
      } else if (value !== null && typeof value === 'object' && !seen.has(value)) {
        (item as Record<string, unknown>)[key] = processDataPropertiesStep(value, opts, path, seen);
      } else if (value !== null && typeof value === 'object' && seen.has(value)) {
        // don't follow circular references
      } else {
        throw new Error(`Data property action is invalid: ${JSON.stringify({element, key})}`);
      }
      break;

    default:
      // ignore
      break;
  }
}

function processDataPropertyAction(
  item: unknown, key: string | number, value: unknown,
  opts: ProcessDataPropertyOptions, path: ProcessDataPropertyPath, seen: WeakSet<object>
): void {
  const element = processDataProperty(value, opts, path, seen);
  switch (element?.action) {
    case "throw":
      throw new Error(`Data property action: ${JSON.stringify(element)}`);

    case "delete":
      if (Array.isArray(item) && typeof key === 'number') {
        item.splice(key, 1, [undefined]);
      } else if (typeof item === 'object') {
        delete (item as Record<string, unknown>)[key];
      } else {
        throw new Error(`Data property action is invalid: ${JSON.stringify({element, key})}`);
      }
      break;

    case "replace":
      if (Array.isArray(item) && typeof key === 'number') {
        item.splice(key, 1, [element.replaceValue]);
      } else if (typeof item === 'object') {
        (item as Record<string, unknown>)[key] = element.replaceValue;
      } else {
        throw new Error(`Data property action is invalid: ${JSON.stringify({element, key})}`);
      }
      break;

    case "ignore":
      if (Array.isArray(item) && typeof key === 'number') {
        item[key] = processDataPropertiesStep(value, opts, path, seen);
      } else if (value !== null && typeof value === 'object' && !seen.has(value)) {
        (item as Record<string, unknown>)[key] = processDataPropertiesStep(value, opts, path, seen);
      } else if (value !== null && typeof value === 'object' && seen.has(value)) {
        // don't follow circular references
      } else {
        throw new Error(`Data property action is invalid: ${JSON.stringify({element, key})}`);
      }
      break;

    default:
      // ignore
      break;
  }
}

function processDataProperty(
  value: unknown, opts: ProcessDataPropertyOptions, path: ProcessDataPropertyPath, seen: WeakSet<object>
): ProcessDataPropertyPathElement | null {
  if (!hasAnyOpts(opts)) {
    return null;
  }

  const optElements = opts?.elements ?? [];
  const optCustom = opts?.custom ?? [];

  let elements: ProcessDataPropertyPathElement[] = [];

  // is seen?
  if (value !== null && typeof value === 'object' && seen.has(value)) {
    // exact path match first, otherwise match with no path
    const elementCircular = opts?.elements?.find(e =>
        e.type === "circular" && Array.isArray(e.path) && arrayEqualsArray(e.path, path)
      ) ??
      opts?.elements?.find(e =>
        e.type === "circular" && !Array.isArray(e.path)
      );
    if (elementCircular) {
      elements.push(elementCircular);
    }
  }

  // is function?
  if (value !== null && typeof value === 'function') {
    // exact path match first, otherwise match with no path
    const elementFunction = opts?.elements?.find(e =>
        e.type === "function" && Array.isArray(e.path) && arrayEqualsArray(e.path, path)
      ) ??
      opts?.elements?.find(e =>
        e.type === "function" && !Array.isArray(e.path)
      );
    if (elementFunction) {
      elements.push(elementFunction);
    }
  }

  // custom action elements
  for (const optCustomElement of optCustom) {
    const element = optCustomElement(value, path, opts, seen);
    if (element !== null) {
      elements.push(element);
    }
  }

  // action elements with path
  for (const optElement of optElements) {
    if (!Array.isArray(optElement.path) || optElement.path.length < 1) {
      continue;
    }
    if (!arrayEqualsArray(optElement.path, path)) {
      continue;
    }
    elements.push({
      action: optElement.action,
      path: [...path],
      replaceValue: optElement.replaceValue,
      type: optElement.type,
    });
  }

  // select action to return
  const actionThrow = elements?.find(e => e.action === "throw") ?? null;
  if (actionThrow !== null) {
    return actionThrow;
  }

  const actionDelete = elements?.find(e => e.action === "delete") ?? null;
  if (actionDelete !== null) {
    return actionThrow;
  }

  const actionRedact = elements?.find(e => e.action === "replace") ?? null;
  if (actionRedact !== null) {
    return actionRedact;
  }

  return null;
}
