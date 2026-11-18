import type { NamedQueryJson } from './named-query.model';

export type RecordGridScalarType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'DATETIME';
export type RecordGridOperator = 'eq' | 'contains' | 'iprefix' | 'gt' | 'lt' | 'between' | 'in' | 'exists';
export type RecordGridScalar = string | number | boolean;
/** Discovery cardinality. Missing expected cardinality on a saved definition means legacy SCALAR. */
export type RecordGridCardinality = 'SCALAR' | 'LIST';
const RECORD_GRID_SCALARS = ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATETIME'];
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
  if (!['eq', 'contains', 'iprefix', 'gt', 'lt', 'between', 'in', 'exists'].includes(operator))
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
  if (operator === 'iprefix' && (scalarType !== 'STRING' || !values[0].length)) throw new Error('invalid-iprefix');
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

export interface RecordGridFieldCapabilities {
  scalarType: string;
  repeating: boolean;
  availableInAllVariants: boolean;
  /** Current discovery cardinality. Repeating fields are usable only as declared scalar LISTs. */
  cardinality?: RecordGridCardinality;
}
/** A repeating field is queryable only when discovery declares it a scalar list. */
function queryableCardinality(field: RecordGridFieldCapabilities): RecordGridCardinality | undefined {
  const cardinality = field.cardinality ?? (field.repeating ? undefined : 'SCALAR');
  if (cardinality === 'SCALAR') return field.repeating ? undefined : cardinality;
  return cardinality === 'LIST' && field.repeating && RECORD_GRID_SCALARS.includes(field.scalarType)
    ? cardinality
    : undefined;
}

/** Capabilities must come from current discovery, never the submitted draft. */
export function recordGridFilter(
  filter: {
    fieldId: string;
    expectedScalarType?: string;
    expectedCardinality?: RecordGridCardinality;
    operator: RecordGridOperator;
    values: readonly string[];
  },
  field: RecordGridFieldCapabilities & { filterable: boolean; operators: readonly string[] }
): NamedQueryJson {
  const cardinality = queryableCardinality(field);
  if (
    !field.filterable ||
    !cardinality ||
    !field.availableInAllVariants ||
    !field.operators.some(operator => operator.toLowerCase() === filter.operator)
  )
    throw new Error('schema-changed');
  if (!filter.expectedScalarType || filter.expectedScalarType !== field.scalarType)
    throw new Error('filter-type-changed');
  // Element (any-value) semantics differ from scalar semantics: never reinterpret silently.
  if ((filter.expectedCardinality ?? 'SCALAR') !== cardinality) throw new Error('filter-cardinality-changed');
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
  if (filter.operator === 'exists' || filter.operator === 'contains' || filter.operator === 'iprefix') {
    if (Array.isArray(value)) throw new Error('invalid-value');
    operand = value;
  } else if (Array.isArray(value)) {
    operand = filter.operator === 'between' ? { from: typed(value[0]), to: typed(value[1]) } : value.map(typed);
  } else operand = typed(value);
  return { field: filter.fieldId, [filter.operator]: operand };
}

/** Validate a visual sort against current discovery. Lists sort by their
 * minimum (ascending) or maximum (descending) valid element. */
export function recordGridSort(
  sort: {
    fieldId: string;
    direction: 'asc' | 'desc';
    expectedScalarType?: string;
    expectedCardinality?: RecordGridCardinality;
  },
  field: RecordGridFieldCapabilities & { sortable: boolean }
): { field: string; direction: 'ASC' | 'DESC' } {
  const cardinality = queryableCardinality(field);
  if (!field.sortable || !cardinality || !field.availableInAllVariants || !['asc', 'desc'].includes(sort.direction))
    throw new Error('schema-changed');
  if (!sort.expectedScalarType || sort.expectedScalarType !== field.scalarType) throw new Error('sort-type-changed');
  if ((sort.expectedCardinality ?? 'SCALAR') !== cardinality) throw new Error('sort-cardinality-changed');
  return { field: sort.fieldId, direction: sort.direction === 'asc' ? 'ASC' : 'DESC' };
}
