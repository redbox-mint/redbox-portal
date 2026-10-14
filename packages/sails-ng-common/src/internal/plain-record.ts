/**
 * Internal helpers shared by the data-only record contracts. This module is
 * deliberately absent from the package index: the guards below are an
 * implementation detail of the exported sanitizers, not public contract.
 */

/**
 * True only for ordinary data objects. Class instances, arrays, and exotic
 * objects are rejected so untrusted payloads cannot smuggle prototypes or
 * accessors through a contract boundary.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
