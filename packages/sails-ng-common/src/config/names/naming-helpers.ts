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
}

/**
 * Allow providing a partial lineage paths object.
 * This is for adding to an existing lineage path.
 */
export interface LineagePathsPartial {
    formConfig?: LineagePath;
    dataModel?: LineagePath;
    angularComponents?: LineagePath;
}

export const lineagePathTypes = ["formConfig", "dataModel", "angularComponents"] as const;
export type LineagePathTypes = typeof lineagePathTypes[number];


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
    };
    lineagePaths.angularComponentsJsonPointer = getJSONPointerByArrayPaths(lineagePaths.angularComponents);
    return lineagePaths;
}

export const lineagePathMatchTypes = ["prefix", "suffix", "contains"] as const;
export type LineagePathMatchTypes = typeof lineagePathMatchTypes[number];

/**
 * The specification for searching lineage paths for a match.
 */
export interface LineagePathSearch {
    type: LineagePathTypes;
    path: LineagePath;
    match: LineagePathMatchTypes;
}

/**
 * Search lineage paths for a match.
 * @param lineagePaths The lineage paths to search.
 * @param search The search approach.
 * @return The type of lineage path that matched, otherwise null for no match.
 */
export function searchLineagePaths(lineagePaths: LineagePaths, search: LineagePathSearch): LineagePathTypes | null {
    if (!lineagePaths || !search) {
        return null;
    }

    // Ensure the search type is valid.
    const path = lineagePaths[search.type];
    if (path === null || path === undefined) {
        return null;
    }

    // If both arrays are empty, that's a match.
    if (search.path.length === 0 && path.length === 0) {
        return search.type;
    }

    const lengthsOk = search.path.length > 0 && search.path.length <= path.length;
    if (!lengthsOk) {
        return null;
    }

    // Find search.path in path.
    let startIndex = 0;
    switch (search.match) {
        case "prefix":
            startIndex = 0;
            break;
        case "suffix":
            startIndex = path.length - search.path.length;
            break;
        case "contains":
            const containsStartIndex = path.indexOf(search.path[0]);
            if (containsStartIndex === -1) {
                return null;
            }
            break;
        default:
            return null;
    }

    // The lineage path must have the same values starting at startIndex.
    return search.path
        .every((value, index) => path.length < index + startIndex && path[index + startIndex] === value)
        ? search.type : null;
}

/**
 * Helper to build partial a lineage path object.
 * @param lineagePaths The properties to include.
 * @return A valid lineage path object.
 */
export function makeLineagePaths(lineagePaths?: LineagePathsPartial): LineagePaths {
    return {
        formConfig: lineagePaths?.formConfig ?? [],
        dataModel: lineagePaths?.dataModel ?? [],
        angularComponents: lineagePaths?.angularComponents ?? [],
    };
}

/**
 * Get a JSON Pointer string from an array of path segments.
 *
 * @param paths
 * @returns JSON Pointer string
 */

export function getJSONPointerByArrayPaths(paths: (string | number)[]): string {
    return formatJsonPointer(paths);
}

/**
 * Retrieve any object property using a JSON Pointer or an array of path segments.
 *
 * @param obj
 * @param pointer
 * @returns JSON Pointer reference: {key: 'key', val: 'object value at key', obj: 'context object, 1 level up from key'}
 */
export function getObjectWithJsonPointer(obj: any, pointer: string | string[]): any {
    if (Array.isArray(pointer)) {
        return find(obj, pointer);
    }
    // Documentation has the order of the parameters reversed compared to the type definition.
    return findByPointer(pointer, obj);
}

/**
 * Retrieve the last segment of a JSONPointer string
 */
export function getLastSegmentFromJSONPointer(pointer: string): string {
    const segments = pointer.split('/');
    return segments[segments.length - 1];
}
