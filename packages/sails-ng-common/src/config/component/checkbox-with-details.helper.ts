import type {
  CheckboxDetailFieldFrame,
  CheckboxWithDetailsFieldComponentConfigFrame,
  CheckboxWithDetailsRow,
} from './checkbox-with-details.outline';

type DetailFields<T> = {
  detailFields?: readonly T[];
  detailFieldsByValue?: Readonly<Record<string, readonly T[]>>;
};

export function checkboxDetailFields<T>(config: DetailFields<T> | undefined, value: string): T[] {
  const byValue = config?.detailFieldsByValue;
  return [...(config?.detailFields ?? []), ...(byValue && Object.hasOwn(byValue, value) ? byValue[value] : [])];
}

/** Validate the choices and report mappings for codes outside that option list. */
export function checkCheckboxWithDetailsOptions(config: CheckboxWithDetailsFieldComponentConfigFrame): string[] {
  const options = config.options;
  const optionValues = new Set<string>();
  if (options !== undefined && !Array.isArray(options)) throw new Error('Expected a checkbox options array.');
  for (const option of options ?? []) {
    if (
      typeof option?.label !== 'string' ||
      !option.label.trim() ||
      typeof option?.value !== 'string' ||
      !option.value.trim() ||
      optionValues.has(option.value)
    ) {
      throw new Error('CheckboxWithDetails options require unique nonempty string values and nonempty string labels.');
    }
    optionValues.add(option.value);
  }
  return Object.keys(config.detailFieldsByValue ?? {}).filter(value => !optionValues.has(value));
}

/** Inspect authored templates separately from the submitted array. */
export function checkCheckboxWithDetailsConfig(
  config: CheckboxWithDetailsFieldComponentConfigFrame
): string[] {
  const unmatched = checkCheckboxWithDetailsOptions(config);

  function checkFields(fields: readonly CheckboxDetailFieldFrame[] | undefined, names: Set<string>): void {
    if (fields === undefined) return;
    if (!Array.isArray(fields)) throw new Error('Expected a checkbox detail fields array.');
    for (const field of fields) {
      const name = field?.name;
      if (typeof name !== 'string' || !name.trim() || names.has(name) || Object.hasOwn(Object.prototype, name)) {
        throw new Error(`Invalid or duplicate checkbox detail field name '${name}'.`);
      }
      const component = field.component;
      const model = field.model?.class;
      const supported =
        (component?.class === 'SimpleInputComponent' &&
          (component.config?.type === undefined || component.config.type === 'text') &&
          (!model || model === 'SimpleInputModel')) ||
        (component?.class === 'TextAreaComponent' && (!model || model === 'TextAreaModel'));
      if (!supported || (field.layout && field.layout.class !== 'DefaultLayout')) {
        throw new Error(
          `Unsupported checkbox detail field '${name}'. Use a text input or textarea with DefaultLayout.`
        );
      }
      if (
        field.expressions?.length ||
        Object.keys(field.overrides ?? {}).length ||
        Object.keys(field.constraints ?? {}).length
      ) {
        throw new Error(`Checkbox detail field '${name}' cannot declare expressions, constraints, or overrides.`);
      }
      names.add(name);
    }
  }

  const sharedNames = new Set<string>();
  checkFields(config.detailFields, sharedNames);
  const mapping = config.detailFieldsByValue;
  if (mapping !== undefined && (!mapping || typeof mapping !== 'object' || Array.isArray(mapping))) {
    throw new Error('Expected an object of checkbox detail fields by option value.');
  }
  for (const [value, fields] of Object.entries(mapping ?? {})) {
    if (!value.trim()) {
      throw new Error(`Checkbox detail fields refer to unknown option '${value}'.`);
    }
    checkFields(fields, new Set(sharedNames));
  }
  return unmatched;
}

/** Tolerant reader for display and editor hydration. Validated writes inspect the original value. */
export function readCheckboxWithDetailsRows(value: unknown): CheckboxWithDetailsRow[] {
  const rows = new Map<string, CheckboxWithDetailsRow>();
  if (!Array.isArray(value)) return [];
  for (const row of value) {
    if (!row || typeof row.value !== 'string' || !row.value.trim() || rows.has(row.value)) continue;
    const source = row.details;
    const entries = source && typeof source === 'object' && !Array.isArray(source) ? Object.entries(source) : [];
    const details: CheckboxWithDetailsRow['details'] = Object.fromEntries(
      entries.filter((entry): entry is [string, string | null] => {
        const [key, answer] = entry;
        return !Object.hasOwn(Object.prototype, key) && (answer === null || typeof answer === 'string');
      })
    );
    rows.set(row.value, { value: row.value, details });
  }
  return [...rows.values()];
}

/** Labels and populated answers for one selected row in Edit, View or PDF. */
export function checkboxDetailsDisplayFields(
  config: CheckboxWithDetailsFieldComponentConfigFrame | undefined,
  row: CheckboxWithDetailsRow,
  includeUnconfigured: boolean
): Array<{ name: string; label: string; answer: string }> {
  const schema = checkboxDetailFields(config, row.value);
  const fields: Array<{ name: string; label: string; answer: string }> = [];
  for (const field of schema) {
    const name = field.name;
    const answer = name && Object.hasOwn(row.details, name) ? row.details[name] : null;
    if (!name || !answer || field.component.config?.visible === false || field.layout?.config?.visible === false)
      continue;
    fields.push({ name, label: field.layout?.config?.label || field.component.config?.label || name, answer });
  }
  if (includeUnconfigured) {
    const known = new Set(schema.map(field => field.name));
    for (const [name, answer] of Object.entries(row.details)) {
      if (answer && !known.has(name)) fields.push({ name, label: name, answer });
    }
  }
  return fields;
}

/** A stable, namespaced component path segment. The data path still uses the row index. */
export function checkboxDetailsOptionPath(value: string): string {
  return `option:${value}`;
}
