import { FigshareCategory, FigshareLicense } from '../figshare/types';
import { ControlledValue, ControlledValueResult, NormalisedField } from '../normalisation/types';

function lower(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function controlledValue(value: unknown, index: number): ControlledValue | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { value: String(value) };
  }
  if (value == null || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const id = record.id ?? record.value_id ?? record.key;
  const rawValue = record.value ?? record.name ?? record.title ?? record.label;
  if (rawValue == null) {
    return undefined;
  }
  const label = record.label ?? record.name ?? record.title;
  return {
    ...(typeof id === 'string' || typeof id === 'number' ? { id } : {}),
    value: String(rawValue),
    ...(label == null ? {} : { label: String(label) }),
  };
}

function inlineValues(settings: unknown): ControlledValue[] | undefined {
  if (Array.isArray(settings)) {
    const values = settings.map(controlledValue).filter((value): value is ControlledValue => value != null);
    return values.length > 0 ? values : undefined;
  }
  if (settings == null || typeof settings !== 'object') {
    return undefined;
  }
  const record = settings as Record<string, unknown>;
  for (const key of ['values', 'options', 'choices', 'items', 'allowed_values', 'allowedValues']) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      const values = candidate.map(controlledValue).filter((value): value is ControlledValue => value != null);
      if (values.length > 0) return values;
    }
  }
  return undefined;
}

function isLicense(field: NormalisedField): boolean {
  const candidates = [field.name, field.displayName, field.type].map(lower);
  return candidates.some(
    value => value === 'license' || value === 'licence' || value.includes('license') || value.includes('licence')
  );
}

function isCategory(field: NormalisedField): boolean {
  return [field.name, field.displayName, field.type]
    .map(lower)
    .some(value => value === 'category' || value === 'categories' || value.includes('category'));
}

function isDynamic(field: NormalisedField): string | undefined {
  const combined = [field.name, field.displayName, field.type].map(lower).join(' ');
  if (combined.includes('author')) return 'Author values are resolved dynamically through the Figshare account API.';
  if (combined.includes('dropdown_large_list') || combined.includes('large list')) {
    return 'Values are stored in a Figshare-managed large list and may require a field-specific API lookup.';
  }
  return undefined;
}

function isUnconstrained(fieldType: string): boolean {
  return /^(text|string|textarea|rich[-_ ]?text|number|integer|float|date|datetime|url|email|keywords?|list|object[-_ ]?list)$/.test(
    fieldType
  );
}

export class ControlledValueResolver {
  public constructor(
    private readonly licenses: FigshareLicense[],
    private readonly categories: FigshareCategory[],
    private readonly categoryPaths: ReadonlyMap<string, string>
  ) {}

  public async resolve(field: NormalisedField): Promise<ControlledValueResult> {
    if (isLicense(field)) {
      return {
        kind: 'api-reference',
        entity: 'license',
        values: this.licenses.map(license => ({
          id: license.id,
          value: license.name,
          label: license.name,
        })),
      };
    }
    if (isCategory(field)) {
      return {
        kind: 'api-reference',
        entity: 'category',
        values: this.categories.map(category => ({
          id: category.id,
          value: this.categoryPaths.get(String(category.id)) ?? category.title,
          label: category.title,
        })),
      };
    }
    const inline = inlineValues(field.settings);
    if (inline != null) {
      return { kind: 'inline', values: inline };
    }
    const type = lower(field.type);
    if (type === 'boolean' || type === 'bool' || type === 'checkbox') {
      return {
        kind: 'inline',
        values: [
          { value: 'true', label: 'True' },
          { value: 'false', label: 'False' },
        ],
      };
    }
    const dynamicDescription = isDynamic(field);
    if (dynamicDescription != null) {
      return { kind: 'dynamic', description: dynamicDescription };
    }
    if (isUnconstrained(type)) {
      return { kind: 'none' };
    }
    return {
      kind: 'unknown',
      raw: {
        type: field.type,
        settings: field.settings,
        configuration: field.rawConfiguration,
      },
    };
  }
}
