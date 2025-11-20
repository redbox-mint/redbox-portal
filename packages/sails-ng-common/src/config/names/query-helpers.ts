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
import { includes as _includes } from "lodash"; 

export interface JSONataQuerySourcePropertyEntry {
  name: string;
  lineagePaths?: LineagePaths;
  jsonPointer?: string;
  children?:  JSONataQuerySourcePropertyEntry[] ;
  // convenience references to component and model
  // specific type depends on context, specialise as needed
  wrapper?: unknown;
  component?: unknown;
  model?: unknown;
  layout?: unknown;
}

export interface JSONataQuerySource {
  // The original object that this was derived from
  queryOrigSource: unknown;
  // The object that will be used for querying 
  querySource: JSONataQuerySourcePropertyEntry[];
}
/**
 * Performs a deep copy of an object, removing circular references.
 * 
 * TODO: Consider trimming more properties that are not needed querying.
 * 
 * @param obj 
 * @param filters 
 * @returns 
 */
export function decycleObject(obj: any, filters:string[] = ['lineagePaths', 'appRef', 'lodashTemplateUtilityService', 'expressionStateChanged', 'wrapperRefs', 'componentsDefinitionsContainerRef', 'injector', 'formService']): any {
  const cache = new Set();
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    // Names that will be filtered out to lessen size
    if (_includes(filters, key)) {
      return;
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
 * Simple query function for string inputs. Not meant for integation with the form app, which requires pre-compilation.
 * @param querySource 
 * @param query 
 */
export function queryJSONata(querySource: JSONataQuerySource, query: string): any {
  const queryDoc = decycleObject(querySource.querySource);
  const expression = jsonata(query);
  const result = expression.evaluate(queryDoc);
  return result;
}