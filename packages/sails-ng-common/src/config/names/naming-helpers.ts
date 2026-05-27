// Copyright (c) 2025 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import {find, findByPointer, formatJsonPointer} from '@jsonjoy.com/json-pointer';
import {arrayStartsWithArray} from "../helpers";

// Shared lineage path helpers and types.
// Moved from FormService and form-field-base.component to make them reusable across libs.

/**
 * A lineage path is an ordered list of keys (string|number) describing a path lineage for
 * different domains of form configuration.
 * A string key is a property name or array index number as a string, a number key is an array index.
 */
export type LineagePath = (string | number)[];

/**
 * A collection of lineage paths that describe different relationships.
 */
export interface LineagePaths {
    /**
     * The path to the item in the form config.
     */
    formConfig: LineagePath;
    /**
     * The path to the item in the form data model.
     */
    dataModel: LineagePath;
    /**
     * The path to the item in the angular control hierarchy.
     */
    angularComponents: LineagePath;
    /**
     * The JSONPointer to the angular control.
     */
    angularComponentsJsonPointer?: string;
    /**
     * The path to the item in the layout hierarchy.
     * Uses the component name with a "-layout" suffix.
     */
    layout: LineagePath;
    /**
     * The JSONPointer to the layout item.
     */
    layoutJsonPointer?: string;
}

/**
 * Allow providing a partial lineage paths object.
 * This is for adding to an existing lineage path.
 *
 * This does not include the calculated json pointer fields on purpose.
 * Use LineagePathsOptional to include the json pointer fields.
 */
export interface LineagePathsPartial {
    formConfig?: LineagePath;
    dataModel?: LineagePath;
    angularComponents?: LineagePath;
    layout?: LineagePath;
}

/**
 * Allow providing any of the lineage paths properties.
 *
 * This does include the calculated json pointer fields on purpose.
 * Use LineagePathsPartial to include only the fields that are not calculated.
 */
export type LineagePathsOptional = Partial<LineagePaths>;

/**
 * Build the lineage paths from a base item, and add the entries in `more` as relative
 * parts at the end of each lineage path. Undefined inputs default to empty arrays.
 * This was previously an instance method of FormService.
 */
export function buildLineagePaths(base?: LineagePaths, more?: LineagePathsPartial): LineagePaths {
    const lineagePaths: LineagePaths = {
        formConfig: [...(base?.formConfig ?? []), ...(more?.formConfig ?? [])],
        dataModel: [...(base?.dataModel ?? []), ...(more?.dataModel ?? [])],
        angularComponents: [...(base?.angularComponents ?? []), ...(more?.angularComponents ?? [])],
        layout: [...(base?.layout ?? []), ...(more?.layout ?? [])],
    };
    lineagePaths.angularComponentsJsonPointer = getJSONPointerByArrayPaths(lineagePaths.angularComponents);
    lineagePaths.layoutJsonPointer = getJSONPointerByArrayPaths(lineagePaths.layout);
    return lineagePaths;
}

/**
 * Get a JSON Pointer string from an array of path segments.
 *
 * @param paths
 * @returns JSON Pointer string
 */

export function getJSONPointerByArrayPaths(paths: (string | number)[]): string {
  try {
    return formatJsonPointer(paths);
  } catch (err) {
    console.error(`getJSONPointerByArrayPaths failed with paths '${paths}'`, err);
    return "";
  }
}

/**
 * Retrieve any object property using a JSON Pointer or an array of path segments.
 *
 * @param obj
 * @param pointer
 * @returns JSON Pointer reference: {key: 'key', val: 'object value at key', obj: 'context object, 1 level up from key'}
 */
export function getObjectWithJsonPointer(obj: any, pointer: string | string[]): any {
  try {
        if (Array.isArray(pointer)) {
            return find(obj, pointer);
        }
        // Documentation has the order of the parameters reversed compared to the type definition.
        return findByPointer(pointer, obj);
    } catch (e: unknown) {
        console.error(`getObjectWithJsonPointer failed with obj '${obj}' and pointer '${pointer}'`, e);
        // @jsonjoy.com/json-pointer throws on missing keys: `find` throws `new Error("NOT_FOUND")`,
        // `findByPointer` throws the literal string "NOT_FOUND". All current callers are written
        // as tolerant lookups (optional chaining / undefined checks), so treat a miss as undefined
        // instead of letting the throw escape into Angular's global ErrorHandler.
        const msg = e instanceof Error ? e.message : e;
        if (msg === 'NOT_FOUND') {
            return undefined;
        }
        throw e;
    }
}

/**
 * Retrieve the last segment of a JSONPointer string
 */
export function getLastSegmentFromJSONPointer(pointer: string): string {
    if (!pointer) {
      return "";
    }
    if (!pointer.includes('/')) {
      return pointer;
    }
    const segments = pointer.split('/');
    return segments[segments.length - 1];
}

/**
 * Normalise a string to reduce the potential variations in how characters are specified.
 *
 * @param value The value to normalise.
 * @return The string normalised to remove visual variants.
 */
export function normaliseVisual(value: unknown): string {
  const str = value?.toString() ?? "";

  // Use NFKC: Compatibility Decomposition, followed by Canonical Composition.
  // For Identifiers matching: Canonical form, no visual variants
  return str.normalize("NFKC");
}

/**
 * Determine if any lineage path in two lineage paths match.
 * @param a The first lineage paths.
 * @param b The second lineage paths.
 */
export function isMatchingLineagePaths(a: LineagePathsOptional, b: LineagePathsOptional): boolean {
  const aRecord: Record<string, LineagePath | string | undefined> = a ?? {};
  const bRecord: Record<string, LineagePath | string | undefined> = b ?? {};
  const keys = Array.from(new Set<string>([...Object.keys(aRecord), ...Object.keys(bRecord)]));
  return keys.every(key => {
    if (key in aRecord && key in bRecord) {
      const aValue = aRecord[key] ?? "";
      const bValue = bRecord[key] ?? "";
      return aValue === bValue || isMatchingLineagePath(aValue, bValue);
    }
    // A key in only a or b is allowed.
    return true;
  });
}

/**
 * Determine if two lineage paths or strings are equal.
 * @param a The first lineage path or string.
 * @param b The second lineage path or string.
 */
export function isMatchingLineagePath(a: LineagePath | string, b: LineagePath | string): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a === b;
  }
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((aValue, aIndex) => aValue?.toString() === b[aIndex]?.toString());
}

/**
 * Determine if a check lineage path starts with a base lineage path.
 * @param base The prefix.
 * @param check The item that should start with prefix.
 */
export function isPrefixLineagePaths(base: LineagePathsOptional, check: LineagePathsOptional): boolean {
  const aRecord: Record<string, LineagePath | string | undefined> = base ?? {};
  const bRecord: Record<string, LineagePath | string | undefined> = check ?? {};
  const keys = Array.from(new Set<string>([...Object.keys(aRecord), ...Object.keys(bRecord)]));
  return keys.every(key => {
    if (key in aRecord && key in bRecord) {
      const aValue = aRecord[key] ?? "";
      const bValue = bRecord[key] ?? "";
      return aValue === bValue || isPrefixLineagePath(aValue, bValue);
    }
    // A key in only base or check is allowed.
    return true;
  });
}

/**
 * Determine if a check lineage path starts with a base lineage path.
 * @param base The prefix.
 * @param check The item that should start with prefix.
 */
export function isPrefixLineagePath(base: LineagePath | string, check: LineagePath | string): boolean {
  if (typeof base === "string" && typeof check === "string") {
    return base === check || check.startsWith(base + '/');
  }
  if (!Array.isArray(base) || !Array.isArray(check)) {
    return false;
  }
  if (base.length === 0 && check.length === 0) {
    return true;
  }
  return arrayStartsWithArray(
    base.map(i => i?.toString()),
    check.map(i => i?.toString()),
  );
}
