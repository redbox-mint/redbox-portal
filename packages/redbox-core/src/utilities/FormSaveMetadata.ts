import { createHmac, randomBytes } from 'node:crypto';
import type { FormRowProofs } from '@researchdatabox/sails-ng-common';
import { hydratedName, selectionPropertyNames } from './FormEditProjection';

type Metadata = Record<string, unknown>;

interface FieldSchema {
  properties?: Record<string, FieldSchema>;
  optionalProperties?: Record<string, FieldSchema>;
  elements?: FieldSchema;
  selection?: 'record' | 'typeahead';
  defaultBlankRow?: boolean;
  retainExistingRowsOnly?: boolean;
}

export class FormSaveInputError extends Error {}

type Path = (string | number)[];

// The proof binds a row position to its stored contents without disclosing them.
export function formRowSigner(req: Sails.Req, oid: string) {
  const key = req.session.formRowProofKey ??= randomBytes(32).toString('hex');
  return (path: Path, index: number, row: unknown) => createHmac('sha256', key)
    .update(JSON.stringify([oid, path.filter(part => typeof part === 'string'), index, row], (_key, value: unknown) =>
      _.isPlainObject(value)
        ? Object.fromEntries(Object.entries(value as Metadata).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
        : value
    ))
    .digest('base64url');
}

type SignRow = ReturnType<typeof formRowSigner>;

/** A null path segment represents any row of the containing list. */
export function editableFormRowPaths(schema: FieldSchema): string[] {
  const paths: string[] = [];
  const collect = (shape: FieldSchema, path: (string | null)[]): void => {
    if (shape.elements) {
      paths.push(JSON.stringify(path));
      collect(shape.elements, [...path, null]);
    } else if (!shape.selection) {
      for (const [key, child] of Object.entries(fields(shape))) collect(child, [...path, key]);
    }
  };
  collect(schema, []);
  return paths;
}

export function loadedFormRowProofs(metadata: unknown, schema: FieldSchema, sign: SignRow, path: Path = []): FormRowProofs {
  const proofs: FormRowProofs = {};
  const collect = (value: unknown, shape: FieldSchema, path: Path): void => {
    if (shape.elements && Array.isArray(value)) {
      const element = shape.elements;
      proofs[JSON.stringify(path)] = value.map((row, index) => sign(path, index, row));
      value.forEach((row, index) => collect(row, element, [...path, index]));
    } else if (!shape.selection && _.isPlainObject(value)) {
      for (const [key, child] of Object.entries(fields(shape))) {
        collect((value as Metadata)[key], child, [...path, key]);
      }
    }
  };
  collect(metadata, schema, path);
  return proofs;
}

export class FormRowSave {
  private readonly lists = new Map<string, { path: Path; schema: FieldSchema }>();

  constructor(private readonly rowEdits: Record<string, unknown>, private readonly sign: SignRow) {}

  getEdits(path: Path, previous: unknown[], submitted: unknown[]) {
    const key = JSON.stringify(path);
    if (!Object.hasOwn(this.rowEdits, key)) return undefined;
    const edits = this.rowEdits[key];
    const invalid = () => new FormSaveInputError('A repeatable row no longer corresponds to its loaded position. Reload the form and retry.');
    if (!Array.isArray(edits) || edits.length !== submitted.length) throw invalid();
    const used = new Set<number>();
    const result = edits.map((edit: unknown, index) => {
      if (edit === null) return { source: null, retain: false };
      if (!_.isPlainObject(edit)) throw invalid();
      const { source, proof, retain } = edit as Metadata;
      if (typeof source !== 'number' || !Number.isSafeInteger(source) || source < 0 ||
          source >= previous.length || used.has(source) || (retain === true && submitted[index] !== null) ||
          proof !== this.sign(path, source, previous[source])) {
        throw invalid();
      }
      used.add(source);
      return { source, retain: retain === true };
    });
    return result;
  }

  confirmList(path: Path, schema: FieldSchema): void {
    this.lists.set(JSON.stringify(path), { path, schema });
  }

  savedConfirmation(expected: Metadata, saved: Metadata) {
    const confirmedListPaths: string[] = [];
    const savedRowProofs: FormRowProofs = {};
    for (const [key, { path, schema }] of this.lists) {
      // A hook which changes a parent list can also invalidate its children's positions.
      const ancestors = path.flatMap((part, index) => typeof part === 'number' ? [path.slice(0, index)] : []);
      if (![...ancestors, path].every(list => _.isEqual(_.get(expected, list), _.get(saved, list)))) continue;
      confirmedListPaths.push(key);
      if (schema.elements) {
        const rows = _.get(saved, path) as unknown;
        Object.assign(savedRowProofs, loadedFormRowProofs(Array.isArray(rows) ? rows : [], schema, this.sign, path));
      }
    }
    return { confirmedListPaths, savedRowProofs };
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
  const projected = Object.fromEntries(permitted.filter(key => Object.hasOwn(stored, key)).map(key => [key, stored[key]]));
  if (permitted.includes('name')) {
    const name = hydratedName(stored);
    if (name !== undefined) projected.name = name;
  }
  return _.isEqual(projected, submitted);
}

function hasStoredOnlyValue(value: unknown, schema: FieldSchema, submitted?: unknown): boolean {
  if (schema.retainExistingRowsOnly) return Array.isArray(value) && value.length > 0;
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

function mergeRows(previous: unknown[], changed: unknown[], element: FieldSchema, path: Path): unknown[] {
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
    return matches.length === 1 ? mergeValue(previous[match], row, element, undefined, [...path, index]) : submitted[index];
  });

  if (unmatched.some(row => previous.some((value, index) => !used.has(index) && hasStoredOnlyValue(value, element, row)))) {
    throw ambiguous();
  }
  return merged;
}

function mergeValue(previous: unknown, changed: unknown, schema: FieldSchema, rows?: FormRowSave, path: Path = []): unknown {
  if (Array.isArray(changed) || (schema.elements && changed === null)) rows?.confirmList(path, schema);
  if (schema.retainExistingRowsOnly) {
    if (!Array.isArray(changed)) return previous;
    const stored = Array.isArray(previous) ? previous : [];
    const edits = rows?.getEdits(path, stored, changed);
    if (!edits) return previous;
    return edits.map(({ source, retain }) => {
      if (!retain || source === null) {
        throw new FormSaveInputError('Only existing read-only rows may be retained or reordered.');
      }
      return stored[source];
    });
  }
  if (schema.elements) {
    if (Array.isArray(changed)) {
      const stored = Array.isArray(previous) ? previous : [];
      const edits = rows?.getEdits(path, stored, changed);
      const element = schema.elements;
      const merged = edits?.map(({ source, retain }, index) => {
        const value = source === null ? undefined : stored[source];
        return retain ? value : mergeValue(value, changed[index], element, rows, [...path, index]);
      });
      if (Array.isArray(previous) && !previous.length && isBlankInput(changed, schema)) return previous;
      return merged ?? mergeRows(stored, changed, element, path);
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
    if (previous && path.some(part => typeof part === 'number') && key === 'name') {
      const legacyName = hydratedName(previous);
      if (legacyName !== previous.name) {
        if (value === legacyName) continue;
        // Record an explicit name without changing the legacy value.
        merged.name = value;
        continue;
      }
    }
    // A missing value can appear as an empty control or a default blank row in the form.
    const childPath = [...path, key];
    if (previous && !stored && isBlankInput(value, permitted[key])) {
      if (rows) mergeValue(undefined, value, permitted[key], rows, childPath);
      continue;
    }
    merged[key] = mergeValue(stored ? previous[key] : undefined, value, permitted[key], rows, childPath);
  }
  return merged;
}
