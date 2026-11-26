import { hydratedName, selectionPropertyNames } from './FormEditProjection';

type Metadata = Record<string, unknown>;

interface FieldSchema {
  properties?: Record<string, FieldSchema>;
  optionalProperties?: Record<string, FieldSchema>;
  elements?: FieldSchema;
  selection?: 'record' | 'typeahead';
  defaultBlankRow?: boolean;
}

export class FormSaveInputError extends Error {}

type Path = (string | number)[];

export class FormRowSave {
  private readonly applied = new Map<string, Path>();

  constructor(private readonly rowEdits: Record<string, unknown>) {}

  getEdits(path: Path, previous: unknown[], submitted: unknown[]) {
    const key = JSON.stringify(path);
    if (!Object.hasOwn(this.rowEdits, key)) return undefined;
    const edits = this.rowEdits[key];
    const invalid = () => new FormSaveInputError('A repeatable row no longer corresponds to its loaded position. Reload the form and retry.');
    if (!Array.isArray(edits) || edits.length !== submitted.length) throw invalid();
    const used = new Set<number>();
    const result = edits.map((edit: unknown, index) => {
      if (edit === null) return { source: null, retain: false };
      const retain = _.isPlainObject(edit) && Object.hasOwn(edit as object, 'retain');
      const source = retain ? (edit as { retain: unknown }).retain : edit;
      if (typeof source !== 'number' || !Number.isSafeInteger(source) || source < 0 ||
          source >= previous.length || used.has(source) || (retain && submitted[index] !== null)) {
        throw invalid();
      }
      used.add(source);
      return { source, retain };
    });
    this.applied.set(key, path);
    return result;
  }

  savedRowCounts(expected: Metadata, saved: Metadata): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [key, path] of this.applied) {
      // A hook which changes a parent list can also invalidate its children's positions.
      const lists = path.flatMap((part, index) => typeof part === 'number' ? [path.slice(0, index)] : []);
      if ([...lists, path].every(list => _.isEqual(_.get(expected, list), _.get(saved, list)))) {
        const rows = _.get(saved, path) as unknown;
        counts[key] = Array.isArray(rows) ? rows.length : 0;
      }
    }
    return counts;
  }
}

function fields(schema: FieldSchema) {
  return { ...schema.properties, ...schema.optionalProperties };
}

function selectionIsUnchanged(previous: unknown, submitted: unknown, schema: FieldSchema): boolean {
  if (_.isEqual(previous, submitted)) return true;
  if (!_.isPlainObject(previous) || !_.isPlainObject(submitted)) return false;
  const stored = previous as Metadata;
  const fieldsInForm = Object.keys(fields(schema));
  const permitted = schema.selection === 'typeahead' ? selectionPropertyNames(stored, fieldsInForm) : fieldsInForm;
  return _.isEqual(Object.fromEntries(permitted.filter(key => Object.hasOwn(stored, key)).map(key => [key, stored[key]])), submitted);
}

function hasStoredOnlyValue(value: unknown, schema: FieldSchema, submitted?: unknown): boolean {
  if (schema.selection) {
    return submitted !== undefined && selectionIsUnchanged(value, submitted, schema) && !_.isEqual(value, mergeValue(undefined, submitted, schema));
  }
  if (schema.elements && Array.isArray(value)) {
    const element = schema.elements;
    if (Array.isArray(submitted) && value.length === submitted.length && matchesSubmittedFields(value, submitted, schema)) {
      return value.some((row, index) => hasStoredOnlyValue(row, element, submitted[index]));
    }
    return value.some(row => hasStoredOnlyValue(row, element) ||
      (Array.isArray(submitted) && submitted.some(candidate => hasStoredOnlyValue(row, element, candidate))));
  }
  if (_.isPlainObject(value) && (schema.properties || schema.optionalProperties)) {
    const permitted = fields(schema);
    const input = _.isPlainObject(submitted) ? submitted as Metadata : undefined;
    return Object.entries(value as Metadata).some(([key, child]) =>
      !Object.hasOwn(permitted, key) || (input !== undefined && !Object.hasOwn(input, key)) ||
      hasStoredOnlyValue(child, permitted[key], input?.[key])
    );
  }
  return false;
}

function isBlankInput(value: unknown, schema: FieldSchema): boolean {
  if (value === null) return true;
  if (schema.elements && Array.isArray(value)) {
    return !value.length ||
      (schema.defaultBlankRow === true && value.length === 1 && isBlankInput(value[0], schema.elements));
  }
  if (!schema.selection && (schema.properties || schema.optionalProperties) && _.isPlainObject(value)) {
    const permitted = fields(schema);
    return Object.entries(value as Metadata).every(([key, child]) =>
      !Object.hasOwn(permitted, key) || isBlankInput(child, permitted[key]));
  }
  return false;
}

function matchesSubmittedFields(previous: unknown, submitted: unknown, schema: FieldSchema, identityOnly = false): boolean {
  // A replacement selection, an inner list edit, or an explicit clear can belong to any matching row.
  if (identityOnly && (submitted === null || submitted === '' || (schema.elements && Array.isArray(submitted)))) return true;
  if (previous === undefined && isBlankInput(submitted, schema)) return true;
  if (schema.selection) return identityOnly || selectionIsUnchanged(previous, submitted, schema);
  if (schema.elements && Array.isArray(previous) && Array.isArray(submitted)) {
    const element = schema.elements;
    return (!previous.length && isBlankInput(submitted, schema)) || (previous.length === submitted.length &&
      submitted.every((row, index) => matchesSubmittedFields(previous[index], row, element)));
  }
  if ((schema.properties || schema.optionalProperties) && _.isPlainObject(previous) && _.isPlainObject(submitted)) {
    const permitted = fields(schema);
    const stored = previous as Metadata;
    return Object.entries(submitted as Metadata).every(([key, value]) =>
      !Object.hasOwn(permitted, key) ||
      matchesSubmittedFields(key === 'name' ? hydratedName(stored) : (Object.hasOwn(stored, key) ? stored[key] : undefined), value, permitted[key], identityOnly)
    );
  }
  return _.isEqual(previous, submitted);
}

function hasIdentityField(value: unknown, schema: FieldSchema): boolean {
  if (schema.selection || schema.elements) return false;
  if ((schema.properties || schema.optionalProperties) && _.isPlainObject(value)) {
    const permitted = fields(schema);
    return Object.entries(value as Metadata).some(([key, child]) =>
      Object.hasOwn(permitted, key) && hasIdentityField(child, permitted[key]));
  }
  return typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && !!value.trim());
}

function mergeRows(previous: unknown[], changed: unknown[], element: FieldSchema): unknown[] {
  const submitted = changed.map(row => mergeValue(undefined, row, element));
  if (!submitted.length || !previous.length || !(element.properties || element.optionalProperties || element.elements)) {
    return submitted;
  }

  // An unchanged visible list keeps its stored order, including duplicate rows.
  if (previous.length === changed.length && changed.every((row, index) =>
    matchesSubmittedFields(previous[index], row, element)
  )) {
    return previous;
  }

  const matchCounts = previous.map(() => 0);
  const candidates = changed.map(row => previous.flatMap((value, index) => {
    // A selection that constitutes the entire row is an atomic editable value.
    if (!matchesSubmittedFields(value, row, element, !element.selection)) return [];
    matchCounts[index]++;
    return [index];
  }));
  const used = new Set<number>();
  const unmatched: unknown[] = [];
  const ambiguous = () => new FormSaveInputError(
    'The submitted repeatable rows cannot be safely matched to their stored values.'
  );
  const singleRowEdit = previous.length === 1 && changed.length === 1;
  const merged = changed.map((row, index) => {
    const matches = candidates[index];
    const needsPreservation = matches.some(candidate => hasStoredOnlyValue(previous[candidate], element, row));
    if (needsPreservation) {
      const identifiable = singleRowEdit || element.selection || hasIdentityField(row, element);
      if (!identifiable || matches.length !== 1 || matchCounts[matches[0]] !== 1) throw ambiguous();
    }
    const match = matches.find(candidate => !used.has(candidate));
    if (match === undefined) {
      unmatched.push(row);
      return submitted[index];
    }
    used.add(match);
    return matches.length === 1 ? mergeValue(previous[match], row, element) : submitted[index];
  });

  if (unmatched.some(row => previous.some((value, index) => !used.has(index) && hasStoredOnlyValue(value, element, row)))) {
    throw ambiguous();
  }
  return merged;
}

function mergeValue(previous: unknown, changed: unknown, schema: FieldSchema, rows?: FormRowSave, path: Path = []): unknown {
  if (schema.elements) {
    if (Array.isArray(changed)) {
      const stored = Array.isArray(previous) ? previous : [];
      const edits = rows?.getEdits(path, stored, changed);
      if (Array.isArray(previous) && !previous.length && isBlankInput(changed, schema)) return previous;
      if (edits) {
        return edits.map(({ source, retain }, index) => {
          const value = source === null ? undefined : stored[source];
          return retain ? value : mergeValue(value, changed[index], schema.elements!, rows, [...path, index]);
        });
      }
      return mergeRows(stored, changed, schema.elements);
    }
    if (changed === null && !hasStoredOnlyValue(previous, schema)) {
      return null;
    }
    throw new FormSaveInputError('Use an empty list to remove repeatable rows.');
  }
  if (schema.properties || schema.optionalProperties) {
    if (schema.selection && selectionIsUnchanged(previous, changed, schema)) return previous;
    if (_.isPlainObject(changed)) {
      const input = changed as Metadata;
      const existing = !schema.selection && _.isPlainObject(previous) ? previous as Metadata : undefined;
      const merged = mergeFormSaveMetadata(existing, input, schema, schema.selection ? undefined : rows, path);
      // Option-object fields can also hold the label/value shape written by earlier forms.
      if (schema.selection === 'typeahead' && typeof input.label === 'string' && typeof input.value === 'string') {
        return { label: input.label, value: input.value, ...merged };
      }
      return merged;
    }
    if (schema.selection && typeof changed === 'string') {
      return changed;
    }
    if (changed === null && !hasStoredOnlyValue(previous, schema)) {
      return null;
    }
    throw new FormSaveInputError('Clear editable fields individually when a group contains fields outside the editable form.');
  }
  return changed;
}

export function mergeFormSaveMetadata(previous: Metadata | undefined, submitted: Metadata, schema: FieldSchema, rows?: FormRowSave, path: Path = []): Metadata {
  const permitted = fields(schema);
  const merged = { ...previous };
  for (const [key, value] of Object.entries(submitted)) {
    if (!Object.hasOwn(permitted, key)) continue;
    const stored = previous && Object.hasOwn(previous, key);
    // A missing value can appear as an empty control or a default blank row in the form.
    const childPath = [...path, key];
    if (previous && !stored && isBlankInput(value, permitted[key])) {
      if (rows) mergeValue(undefined, value, permitted[key], rows, childPath);
      continue;
    }
    if (previous && path.some(part => typeof part === 'number') && key === 'name' && !_.isEqual(previous.name, hydratedName(previous)) && value === hydratedName(previous)) continue;
    merged[key] = mergeValue(stored ? previous[key] : undefined, value, permitted[key], rows, childPath);
  }
  return merged;
}
