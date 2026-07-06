import {arrayEqualsArray} from "./config/helpers";

/**
 * The available actions to take when processing a property.
 *
 * - replace: use another value instead of the current value
 * - delete: remove the object property key or remove array element or otherwise use 'undefined'
 * - throw: throw an error
 * - ignore: do nothing and continue, only used for properties that would otherwise be modified
 */
export type ProcessDataPropertyAction = "replace" | "delete" | "throw" | "ignore";

/**
 * The types of properties that can be processed.
 *
 * - sensitive: a value that should not be revealed in some situations
 * - circular: a value that references another part of the structure that leads to a circular reference
 * - function: a value that is a function
 */
export type ProcessDataPropertyType = "sensitive" | "circular" | "function";

/**
 * The property path indicating how to access a nested object's property.
 */
export type ProcessDataPropertyPath = (string | number)[];

/**
 * One element defining the action to be taken and the type of property.
 * Optionally includes the path to the property and the replace value.
 */
export type ProcessDataPropertyElement = {
  /**
   * The action to take.
   */
  action?: ProcessDataPropertyAction,
  /**
   * The type of property.
   */
  type?: ProcessDataPropertyType,
  /**
   * The property path to match.
   */
  path?: ProcessDataPropertyPath,
  /**
   * The value to use when the action is 'replace'.
   */
  redactValue?: unknown,
}

/**
 * A custom function to assess a property path, value, and whether the value has already been seen.
 * @param value The property value.
 * @param path The property path in the root item.
 * @param opts The options for the processing to be considered in addition to the custom processing this function implements.
 * @param seen The values that have already been seen.
 * @return An element defining the action to take or null to indicate nothing to do.
 */
export type ProcessDataPropertyCustom = (
  value: unknown, path: ProcessDataPropertyPath, opts?: ProcessDataPropertyOptions, seen?: WeakSet<object>
) => ProcessDataPropertyElement | null;

/**
 * The processing configuration options.
 */
export type ProcessDataPropertyOptions = {
  /**
   * The actions to be taken and the type of property.
   */
  elements?: ProcessDataPropertyElement[],
  /**
   * The custom processing.
   */
  custom?: ProcessDataPropertyCustom[]
}

export const processDataPropertyRedactSensitiveElement: ProcessDataPropertyElement = {
  action: "replace",
  type: "sensitive",
  redactValue: "[REDACTED]",
}

export const processDataPropertyRedactCircularElement: ProcessDataPropertyElement = {
  action: "replace",
  type: "circular",
  redactValue: "[CIRCULAR]",
}

export const processDataPropertyRedactKnownSensitivePatternsElement: ProcessDataPropertyCustom = function (
  value: unknown, path: ProcessDataPropertyPath, opts?: ProcessDataPropertyOptions
): ProcessDataPropertyElement | null {
  if (typeof value !== 'string') {
    return null;
  }

  // exact path match first, otherwise match with no path
  const redactValue = opts?.elements?.find(e =>
      e.action === "replace" && e.type === "sensitive" && Array.isArray(e.path) && arrayEqualsArray(e.path, path)
    ) ??
    opts?.elements?.find(e =>
      e.action === "replace" && e.type === "sensitive" && !Array.isArray(e.path)
    );

  const patterns = [
    // JWT
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    // auth bearer
    /^Bearer\s+/i,
    // credential in url
    /\/\/[^:\s]+:[^@\s]+@/,
    // api key pattern
    /^(sk_live_|sk_test_)[A-Za-z0-9]+$/,
  ]

  const trimmed = value.trim();
  for (const pattern of patterns) {
    if (pattern.test(trimmed)) {
      return {
        action: "replace",
        type: "sensitive",
        redactValue: redactValue?.redactValue ?? null,
        path: path,
      }
    }
  }

  // replace based on key names
  if (path.length > 0) {
    const lastPart = path[path.length - 1]?.toString()?.toLowerCase();
    const recognised = lastPart === 'cookie'
      || lastPart === 'authorization'
      || lastPart.startsWith('x-forwarded-')
      || lastPart.includes('password');
    if (recognised) {
      return {
        action: "replace",
        type: "sensitive",
        redactValue: redactValue?.redactValue ?? null,
        path: path,
      }
    }

    // replace cookie map values
    if (path.length > 1) {
      const secondLastPart = path[path.length - 2]?.toString()?.toLowerCase();
      if (secondLastPart === 'cookies') {
        return {
          action: "replace",
          type: "sensitive",
          redactValue: redactValue?.redactValue ?? null,
          path: path,
        }
      }
    }
  }

  return null;
}


/**
 * Process an item according to the provided options.
 * Modifies the provided item.
 * @param item The item to process.
 * @param opts The options for the processing.
 * @return The item after processing.
 */
export function processDataProperties(item: unknown, opts?: ProcessDataPropertyOptions): unknown {
  return processDataPropertiesStep(item, opts ?? {}, [], new WeakSet<object>());
}


function hasAnyOpts(opts?: ProcessDataPropertyOptions): boolean {
  const optElements = opts?.elements ?? [];
  const optCustom = opts?.custom ?? [];

  return optElements.length > 0 || optCustom.length > 0;
}

/**
 * Process a path in an item according to the provided options.
 * @param item The current item to process.
 * @param opts The options for the processing.
 * @param path The current path in the root item.
 * @param seen The values that have already been seen.
 */
function processDataPropertiesStep(
  item: unknown, opts: ProcessDataPropertyOptions, path: ProcessDataPropertyPath, seen: WeakSet<object>
): unknown {
  if (!hasAnyOpts(opts)) {
    return item;
  }
  if (item === undefined || item === null) {
    return item;
  }

  if (typeof item === 'object') {
    seen.add(item);
  }

  // array
  if (Array.isArray(item)) {
    processDataPropertyArrayStep(item, opts, path, seen);
    return item;
  }

  // object
  if (typeof item === 'object') {
    processDataPropertyObjectStep(item, opts, path, seen);
    for (const [key, value] of Object.entries(item)) {
      const keyPath = [...path, key];
      processDataPropertyObjectStep(
        item, key, value, opts, keyPath, seen
      );
    }
    return item;
  }

  // not array and not object
  const container = {value: item};
  processDataPropertyValueStep(
    container, 'value', item, opts, [...path, 'value'], seen
  );
  if ('value' in container) {
    return container.value;
  }

  return undefined;
}

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
        item.splice(key, 1, [element.redactValue]);
      } else if (typeof item === 'object') {
        (item as Record<string, unknown>)[key] = element.redactValue;
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
        item.splice(key, 1, [element.redactValue]);
      } else if (typeof item === 'object') {
        (item as Record<string, unknown>)[key] = element.redactValue;
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
): ProcessDataPropertyElement | null {
  if (!hasAnyOpts(opts)) {
    return null;
  }

  const optElements = opts?.elements ?? [];
  const optCustom = opts?.custom ?? [];

  let elements: ProcessDataPropertyElement[] = [];

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
      redactValue: optElement.redactValue,
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
