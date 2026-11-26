type Metadata = Record<string, unknown>;

interface FieldSchema {
  properties?: Record<string, FieldSchema>;
  optionalProperties?: Record<string, FieldSchema>;
  elements?: FieldSchema;
  selection?: 'record' | 'typeahead';
}

export class FormSaveInputError extends Error {}

function fields(schema: FieldSchema) {
  return { ...schema.properties, ...schema.optionalProperties };
}

function hasStoredOnlyValue(value: unknown, schema: FieldSchema, submitted?: unknown): boolean {
  if (schema.selection) return false;
  if (schema.elements && Array.isArray(value)) {
    const element = schema.elements;
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

function matchesSubmittedFields(previous: unknown, submitted: unknown, schema: FieldSchema, matchParent = false): boolean {
  if (matchParent && submitted === null) return true;
  if (schema.selection) return _.isEqual(previous, submitted);
  if (schema.elements && Array.isArray(previous) && Array.isArray(submitted)) {
    const element = schema.elements;
    return matchParent || (previous.length === submitted.length &&
      submitted.every((row, index) => matchesSubmittedFields(previous[index], row, element)));
  }
  if ((schema.properties || schema.optionalProperties) && _.isPlainObject(previous) && _.isPlainObject(submitted)) {
    const permitted = fields(schema);
    const stored = previous as Metadata;
    return Object.entries(submitted as Metadata).every(([key, value]) =>
      !Object.hasOwn(permitted, key) || (Object.hasOwn(stored, key)
        ? matchesSubmittedFields(stored[key], value, permitted[key], matchParent)
        : value === null)
    );
  }
  return _.isEqual(previous, submitted);
}

function hasSubmittedScalar(row: unknown, schema: FieldSchema): boolean {
  if (schema.selection || !_.isPlainObject(row)) return false;
  const permitted = fields(schema);
  return Object.entries(row as Metadata).some(([key, value]) =>
    Object.hasOwn(permitted, key) &&
    (typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && !!value.trim()))
  );
}

function mergeRows(previous: unknown[], changed: unknown[], element: FieldSchema): unknown[] {
  const submitted = changed.map(row => mergeValue(undefined, row, element));
  if (!submitted.length || !previous.length || !(element.properties || element.optionalProperties || element.elements || element.selection)) {
    return submitted;
  }

  // The same visible rows in the same order can retain their metadata, even if
  // some rows have identical contents. Outside this case, compare submitted fields
  // because a disabled child can be omitted even when it is listed in the schema.
  if (previous.length === changed.length && changed.every((row, index) =>
    matchesSubmittedFields(previous[index], row, element) && matchesSubmittedFields(row, previous[index], element)
  )) {
    return previous;
  }

  const used = new Set<number>();
  const unmatched: unknown[] = [];
  const ambiguous = () => new FormSaveInputError('Repeatable rows with fields outside the editable form cannot be matched safely.');
  const merged = changed.map((row, index) => {
    const replacement = submitted[index];
    const matches = previous.flatMap((value, candidate) => matchesSubmittedFields(value, row, element) ? [candidate] : []);
    const needsPreservation = matches.some(candidate => hasStoredOnlyValue(previous[candidate], element) ||
      !matchesSubmittedFields(replacement, previous[candidate], element));
    if (needsPreservation && (matches.length !== 1 || used.has(matches[0]))) {
      throw ambiguous();
    }
    const match = matches.find(candidate => !used.has(candidate));
    if (match !== undefined) {
      used.add(match);
      return previous[match];
    }
    // A sibling field can identify a row when an inner list changes or a field is cleared.
    // Merge that row's children independently of their old indexes.
    if (!matches.length && hasSubmittedScalar(row, element)) {
      const parents = previous.flatMap((value, candidate) =>
        matchesSubmittedFields(value, row, element, true) ? [candidate] : []);
      if (parents.length === 1 && !used.has(parents[0])) {
        used.add(parents[0]);
        return mergeValue(previous[parents[0]], row, element);
      }
    }
    unmatched.push(row);
    return replacement;
  });

  if (unmatched.some(row => previous.some((value, index) => !used.has(index) && hasStoredOnlyValue(value, element, row)))) {
    throw ambiguous();
  }
  return merged;
}

function mergeValue(previous: unknown, changed: unknown, schema: FieldSchema): unknown {
  if (schema.elements) {
    if (Array.isArray(changed)) {
      return mergeRows(Array.isArray(previous) ? previous : [], changed, schema.elements);
    }
    if (changed === null && !hasStoredOnlyValue(previous, schema)) {
      return null;
    }
    throw new FormSaveInputError('Use an empty list to remove repeatable rows.');
  }
  if (schema.properties || schema.optionalProperties) {
    if (schema.selection && _.isEqual(previous, changed)) return previous;
    if (_.isPlainObject(changed)) {
      const input = changed as Metadata;
      const existing = !schema.selection && _.isPlainObject(previous) ? previous as Metadata : undefined;
      const merged = mergeFormSaveMetadata(existing, input, schema);
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

export function mergeFormSaveMetadata(previous: Metadata | undefined, submitted: Metadata, schema: FieldSchema): Metadata {
  const permitted = fields(schema);
  const merged = { ...previous };
  for (const [key, value] of Object.entries(submitted)) {
    if (!Object.hasOwn(permitted, key)) continue;
    const stored = previous && Object.hasOwn(previous, key);
    // A form initializes missing text and selection controls to null.
    if (previous && !stored && value === null) continue;
    merged[key] = mergeValue(stored ? previous[key] : undefined, value, permitted[key]);
  }
  return merged;
}
