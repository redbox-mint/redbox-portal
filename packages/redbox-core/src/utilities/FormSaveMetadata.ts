import type { FormSaveRowOrigin } from '@researchdatabox/sails-ng-common';
import { FormSaveConflict } from './FormSaveContext';

type Metadata = Record<string, unknown>;
type Path = (string | number)[];

interface FieldSchema {
  properties?: Record<string, FieldSchema>;
  optionalProperties?: Record<string, FieldSchema>;
  elements?: FieldSchema;
  selection?: boolean;
}

export interface FormSaveRows {
  revisionMatches: boolean;
  origins?: Record<string, FormSaveRowOrigin[]>;
}

function fields(schema: FieldSchema) {
  return { ...schema.properties, ...schema.optionalProperties };
}

function hasStoredOnlyValue(value: unknown, schema: FieldSchema): boolean {
  if (schema.elements && Array.isArray(value)) {
    const elementSchema = schema.elements;
    return value.some(element => hasStoredOnlyValue(element, elementSchema));
  }
  if (_.isPlainObject(value) && (schema.properties || schema.optionalProperties)) {
    const allowed = fields(schema);
    return Object.entries(value as Metadata).some(([key, child]) =>
      !Object.hasOwn(allowed, key) || hasStoredOnlyValue(child, allowed[key])
    );
  }
  return false;
}

export function mergeFormSaveMetadata(original: Metadata, submitted: Metadata, schema: FieldSchema, rows: FormSaveRows): Metadata {
  function mergeObject(previous: Metadata, changed: Metadata, fieldSchema: FieldSchema, path: Path): Metadata {
    const permitted = fields(fieldSchema);
    const result = { ...previous };
    for (const [key, value] of Object.entries(changed)) {
      if (Object.hasOwn(permitted, key)) {
        result[key] = mergeValue(Object.hasOwn(previous, key) ? previous[key] : undefined, value, permitted[key], [...path, key]);
      }
    }
    return result;
  }

  function mergeRows(previous: unknown[], changed: unknown[], elementSchema: FieldSchema, path: Path): unknown[] {
    const pathKey = JSON.stringify(path);
    const origins = rows.origins && Object.hasOwn(rows.origins, pathKey) ? rows.origins[pathKey] : undefined;
    const protectedRows = previous.map(row => hasStoredOnlyValue(row, elementSchema));
    const seen = new Set<number>();
    const conflict = () => new FormSaveConflict('Repeatable rows could not be matched to the saved record. Reload the form before saving.');

    if (origins !== undefined && (!Array.isArray(origins) || origins.length !== changed.length
      || (previous.length > 0 && !rows.revisionMatches))) {
      throw conflict();
    }
    if (origins === undefined && changed.length > 0 && protectedRows.includes(true)) {
      throw conflict();
    }

    const merged = changed.map((row, index) => {
      const origin = origins?.[index];
      const retain = typeof origin === 'object' && origin !== null && Number.isSafeInteger(origin.retain);
      const previousIndex = retain ? origin.retain : origin;
      const rowPath = [...path, index];
      if (origin === null || origin === 'new' || origin === undefined) {
        return mergeValue(undefined, row, elementSchema, rowPath);
      }
      if (!rows.revisionMatches || typeof previousIndex !== 'number' || !Number.isSafeInteger(previousIndex)
        || previousIndex < 0 || previousIndex >= previous.length || seen.has(previousIndex)) {
        throw conflict();
      }
      seen.add(previousIndex);
      return retain ? previous[previousIndex] : mergeValue(previous[previousIndex], row, elementSchema, rowPath);
    });
    // Rebuilt controls without provenance can represent edited rows or new rows. Only
    // accept this when each stored row with protected data has a known destination.
    if (origins?.includes(null) && protectedRows.some((isProtected, index) => isProtected && !seen.has(index))) {
      throw conflict();
    }
    return merged;
  }

  function mergeValue(previous: unknown, changed: unknown, fieldSchema: FieldSchema, path: Path): unknown {
    if (fieldSchema.elements && Array.isArray(changed)) {
      const element = fieldSchema.elements;
      return mergeRows(Array.isArray(previous) ? previous : [], changed, element, path);
    }
    if (fieldSchema.properties || fieldSchema.optionalProperties) {
      if (_.isPlainObject(changed)) {
        const existing = !fieldSchema.selection && _.isPlainObject(previous) ? previous as Metadata : {};
        return mergeObject(existing, changed as Metadata, fieldSchema, path);
      }
      if (fieldSchema.selection && typeof changed === 'string') {
        return changed;
      }
      if (changed === null && (fieldSchema.selection || !hasStoredOnlyValue(previous, fieldSchema))) {
        return null;
      }
      throw new FormSaveConflict('A group cannot be cleared while it contains fields outside the editable form. Clear the editable fields individually.');
    }
    if (fieldSchema.elements && (changed !== null || hasStoredOnlyValue(previous, fieldSchema))) {
      throw new FormSaveConflict('Use an empty list to remove repeatable rows.');
    }
    return changed;
  }

  return mergeObject(original, submitted, schema, []);
}
