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

import { formatJsonPointer } from '@jsonjoy.com/json-pointer';

// Shared lineage path helpers and types.
// Moved from FormService and form-field-base.component to make them reusable across libs.
// A lineage path is an ordered list of keys (string|number) describing a path lineage for
// different domains of form configuration (form config JSON, data model, angular components).

export type LineagePath = (string | number)[];

export interface LineagePaths {
	formConfig: LineagePath;
	dataModel: LineagePath;
	angularComponents: LineagePath;
	angularComponentsJsonPointer?: string;
}

/**
 * Build the lineage paths from a base item, and add the entries in `more` as relative
 * parts at the end of each lineage path. Undefined inputs default to empty arrays.
 * This was previously an instance method of FormService.
 */
export function buildLineagePaths(base?: LineagePaths, more?: LineagePaths): LineagePaths {
	const lineagePaths: LineagePaths = {
		formConfig: [...(base?.formConfig ?? []), ...(more?.formConfig ?? [])],
		dataModel: [...(base?.dataModel ?? []), ...(more?.dataModel ?? [])],
		angularComponents: [...(base?.angularComponents ?? []), ...(more?.angularComponents ?? [])],
	};
  lineagePaths.angularComponentsJsonPointer = formatJsonPointer(lineagePaths.angularComponents);
  return lineagePaths;
}


