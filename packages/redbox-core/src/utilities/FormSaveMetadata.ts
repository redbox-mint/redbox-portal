type Metadata = Record<string, unknown>;

interface FieldSchema {
  properties?: Record<string, FieldSchema>;
  optionalProperties?: Record<string, FieldSchema>;
  elements?: FieldSchema;
  selection?: boolean;
}

export class FormSaveInputError extends Error {}

function fields(schema: FieldSchema) {
  return { ...schema.properties, ...schema.optionalProperties };
}

function hasStoredOnlyValue(value: unknown, schema: FieldSchema): boolean {
  if (schema.selection) return false;
  if (schema.elements && Array.isArray(value)) {
    const element = schema.elements;
    return value.some(row => hasStoredOnlyValue(row, element));
  }
  if (_.isPlainObject(value) && (schema.properties || schema.optionalProperties)) {
    const permitted = fields(schema);
    return Object.entries(value as Metadata).some(([key, child]) =>
      !Object.hasOwn(permitted, key) || hasStoredOnlyValue(child, permitted[key])
    );
  }
  return false;
}

function mergeRows(previous: unknown[], changed: unknown[], element: FieldSchema): unknown[] {
  const submitted = changed.map(row => mergeValue(undefined, row, element));
  const protectedRows = previous.map(row => hasStoredOnlyValue(row, element));
  if (!submitted.length || !protectedRows.includes(true)) {
    return submitted;
  }

  // With no row IDs, an exact, unique editable value is the only safe way to
  // associate a retained row with stored-only fields after removal or reordering.
  const previousEditable = previous.map(row => mergeValue(undefined, row, element));
  if (_.isEqual(previousEditable, submitted)) {
    return previous;
  }
  const used = new Set<number>();
  const ambiguous = () => new FormSaveInputError('Repeatable rows with fields outside the editable form cannot be matched safely.');
  let hasUnmatchedSubmission = false;
  const merged = submitted.map(row => {
    const matches = previousEditable.flatMap((value, index) => _.isEqual(value, row) ? [index] : []);
    if (!matches.length) {
      hasUnmatchedSubmission = true;
      return row;
    }
    if (matches.length !== 1 || used.has(matches[0])) throw ambiguous();
    used.add(matches[0]);
    return previous[matches[0]];
  });
  if (hasUnmatchedSubmission && protectedRows.some((isProtected, index) => isProtected && !used.has(index))) {
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
    if (_.isPlainObject(changed)) {
      const existing = !schema.selection && _.isPlainObject(previous) ? previous as Metadata : {};
      return mergeFormSaveMetadata(existing, changed as Metadata, schema);
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

export function mergeFormSaveMetadata(previous: Metadata, submitted: Metadata, schema: FieldSchema): Metadata {
  const permitted = fields(schema);
  const merged = { ...previous };
  for (const [key, value] of Object.entries(submitted)) {
    if (Object.hasOwn(permitted, key)) {
      merged[key] = mergeValue(Object.hasOwn(previous, key) ? previous[key] : undefined, value, permitted[key]);
    }
  }
  return merged;
}
