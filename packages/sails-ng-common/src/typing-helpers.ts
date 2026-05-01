import {guessType} from "./config/helpers";

/**
 * A type guard that checks whether the given key is present in the given item.
 * This check does not indicate anything about the item, only the key.
 *
 * @param item Check if the item has the key as a property name.
 * @param key The key name to check.
 * @return True if the item has the key as a property, false if not.
 */
export function isTypeKeyOfObj<T>(item: T, key: PropertyKey): key is keyof T {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  // Allow non-inherited properties: Object.hasOwn()
  // Or properties present in an object or its prototype chain.
  return Object.hasOwn(item, key) || key in item;
}

/**
 * A type guard that checks whether the item is an object.
 * 'Object' is used in a narrower sense than in JavaScript:
 * here it means a plain object literal or a custom class instance.
 * @param item The item to check.
 * @return True if the item matches this definition of object, false if not.
 */
export function isTypeObjIndexSigStr(item: unknown): item is Record<PropertyKey, unknown> {
  if (item === undefined || item === null) {
    return false;
  }

  const guessedType = guessType(item);
  return typeof item === 'object' && guessedType === "object";
}
