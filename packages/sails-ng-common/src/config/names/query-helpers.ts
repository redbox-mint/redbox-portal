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


/**
 * Helpers for querying components using JSONata.
 * 
 * Note: these functions are intended to be generic and reusable across contexts, i.e. server and client-side. Further specialisation maybe required to be more useful in the specific context.
 */

import { LineagePaths } from "./naming-helpers";
import jsonata from "jsonata";
/**
 * Entry representing a property in the JSONata query source tree.  This must have no circular references, see: https://docs.jsonata.org/next/embedding-extending#expressionevaluateinput-bindings-callback
 */
export interface JSONataQuerySourceProperty {
  name: string;
  lineagePaths?: LineagePaths;
  jsonPointer?: string;
  children?:  JSONataQuerySourceProperty[] ;
}

export interface JSONataQuerySource {
  // The original object that this query source was built from
  queryOrigSource: unknown;
  // JSONata-ready representation of the original object, satisfies JSONata querying requirements (no circular references, etc.)
  querySource: JSONataQuerySourceProperty[];
  // JSONPointer-ready representation of the original source
  jsonPointerSource: unknown;
}
/**
 * Performs a deep copy of an object, removing circular references.
 * 
 * TODO: Consider trimming more properties that are not needed querying.
 * 
 * @param obj 
 * @returns 
 */
export function decycleObjectForJSONata(obj: any): any {
  const cache = new Set();
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'function') {
      return; // Remove functions
    }
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        // Circular reference found, discard key
        return;
      }
      cache.add(value);
    }
    return value;
  }));
}

/**
 * Simple query function for string inputs. Not meant for integration with the form app, which requires pre-compilation.
 * 
 * @param querySource 
 * @param query 
 */
export async function queryJSONata(querySource: JSONataQuerySource, query: string): Promise<any> {
  // `.querySource` should already have no circular references, but just in case...
  const queryDoc = decycleObjectForJSONata(querySource.querySource);
  const expression = jsonata(query);
  const result = await expression.evaluate(queryDoc);
  return result;
}