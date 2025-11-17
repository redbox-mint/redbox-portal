import { formatJsonPointer } from '@jsonjoy.com/json-pointer';
import { format } from 'path';
// Shared lineage path helpers and types.
// Moved from FormService and form-field-base.component to make them reusable across libs.
// A lineage path is an ordered list of keys (string|number) describing a path lineage for
// different domains of form configuration (form config JSON, data model, angular components).

export type LineagePath = (string | number)[];

export interface LineagePaths {
	formConfig: LineagePath;
	dataModel: LineagePath;
	angularComponents: LineagePath;
  jsonPointer?: string;
}

/**
 * Build the lineage paths from a base item, and add the entries in `more` as relative
 * parts at the end of each lineage path. Undefined inputs default to empty arrays.
 * This was previously an instance method of FormService.
 */
export function buildLineagePaths(base?: LineagePaths, more?: LineagePaths): LineagePaths {
	const lineagePaths:LineagePaths = {
		formConfig: [...(base?.formConfig ?? []), ...(more?.formConfig ?? [])],
		dataModel: [...(base?.dataModel ?? []), ...(more?.dataModel ?? [])],
		angularComponents: [...(base?.angularComponents ?? []), ...(more?.angularComponents ?? [])],
	};
  const jsonPointer = formatJsonPointer(lineagePaths.angularComponents);
  lineagePaths.jsonPointer = jsonPointer;
  return lineagePaths;
}


