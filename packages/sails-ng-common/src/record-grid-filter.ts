import type { NamedQueryJson } from './named-query.model';

export type RecordGridScalarType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'DATETIME';
export type RecordGridOperator = 'eq' | 'contains' | 'gt' | 'lt' | 'between' | 'in' | 'exists';
export type RecordGridScalar = string | number | boolean;
export const RECORD_GRID_FILTER_LIMITS = { valueLength: 256, listItems: 20 };

/** Same timestamp subset as the parent collection endpoint: timezone, calendar validity, at most milliseconds and UTC years 1–9999. */
export function normalizeTimestamp(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) throw new Error('invalid-datetime');
  const [, year, month, day, hour, minute, second, , zone] = match;
  const y = Number(year),
    m = Number(month),
    d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    y < 1 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > days[m - 1] ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    (zone.toUpperCase() !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
  )
    throw new Error('invalid-datetime');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new Error('invalid-datetime');
  return date.toISOString();
}

/** Pure visual-input conversion shared by execution and detached promotion. */
export function recordGridFilterValue(
  scalarType: string,
  operator: RecordGridOperator,
  values: readonly string[]
): RecordGridScalar | RecordGridScalar[] {
  if (!['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATETIME'].includes(scalarType))
    throw new Error('invalid-scalar-type');
  if (!['eq', 'contains', 'gt', 'lt', 'between', 'in', 'exists'].includes(operator))
    throw new Error('invalid-operator');
  if (
    values.some(
      value =>
        typeof value !== 'string' || new TextEncoder().encode(value).length > RECORD_GRID_FILTER_LIMITS.valueLength
    )
  )
    throw new Error('invalid-value');
  if (operator === 'exists') {
    if (values.length !== 1 || !['true', 'false'].includes(values[0])) throw new Error('invalid-exists');
    return values[0] === 'true';
  }
  if (operator === 'in') {
    if (!values.length || values.length > RECORD_GRID_FILTER_LIMITS.listItems) throw new Error('invalid-list');
  } else if (values.length !== (operator === 'between' ? 2 : 1)) throw new Error('invalid-value-count');
  if (['gt', 'lt', 'between'].includes(operator) && !['NUMBER', 'INTEGER', 'DATETIME'].includes(scalarType))
    throw new Error('invalid-operator-type');
  if (operator === 'contains' && (scalarType !== 'STRING' || !values[0].length)) throw new Error('empty-contains');
  const converted = values.map(value => {
    if (scalarType === 'NUMBER' || scalarType === 'INTEGER') {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error('invalid-number');
      const number = Number(value);
      if (!Number.isFinite(number) || (scalarType === 'INTEGER' && !Number.isSafeInteger(number)))
        throw new Error('invalid-number');
      return number;
    }
    if (scalarType === 'BOOLEAN') {
      if (!['true', 'false'].includes(value)) throw new Error('invalid-boolean');
      return value === 'true';
    }
    return scalarType === 'DATETIME' ? normalizeTimestamp(value) : value;
  });
  if (operator === 'between' && converted[0] > converted[1]) throw new Error('invalid-range');
  return operator === 'in' || operator === 'between' ? converted : converted[0];
}

/** Capabilities must come from current discovery, never the submitted draft. */
export function recordGridFilter(
  filter: { fieldId: string; expectedScalarType?: string; operator: RecordGridOperator; values: readonly string[] },
  field: {
    scalarType: string;
    filterable: boolean;
    repeating: boolean;
    availableInAllVariants: boolean;
    operators: readonly string[];
  }
): NamedQueryJson {
  if (
    !field.filterable ||
    field.repeating ||
    !field.availableInAllVariants ||
    !field.operators.some(operator => operator.toLowerCase() === filter.operator)
  )
    throw new Error('schema-changed');
  if (!filter.expectedScalarType || filter.expectedScalarType !== field.scalarType)
    throw new Error('filter-type-changed');
  const value = recordGridFilterValue(field.scalarType, filter.operator, filter.values);
  const typed = (value: RecordGridScalar): NamedQueryJson => ({
    [field.scalarType === 'DATETIME'
      ? 'dateTime'
      : field.scalarType === 'NUMBER' || field.scalarType === 'INTEGER'
        ? 'number'
        : field.scalarType === 'BOOLEAN'
          ? 'boolean'
          : 'text']: value,
  });
  let operand: NamedQueryJson;
  if (filter.operator === 'exists' || filter.operator === 'contains') {
    if (Array.isArray(value)) throw new Error('invalid-value');
    operand = value;
  } else if (Array.isArray(value)) {
    operand = filter.operator === 'between' ? { from: typed(value[0]), to: typed(value[1]) } : value.map(typed);
  } else operand = typed(value);
  return { field: filter.fieldId, [filter.operator]: operand };
}
