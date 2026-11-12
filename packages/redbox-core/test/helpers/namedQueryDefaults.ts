import type { NamedQueryParam } from '../../src/config/namedQuery.config';

export const defaultQueryTitle = 'Référence 🌏';
export const namedQueryDefaultDefinitions: ReadonlyArray<{ name: string; parameter: NamedQueryParam }> = [
  {
    name: 'null-default',
    parameter: { type: 'string', path: 'metadata.title', whenUndefined: 'defaultValue', defaultValue: null },
  },
  {
    name: 'non-null-default',
    parameter: {
      type: 'string',
      path: 'metadata.title',
      whenUndefined: 'defaultValue',
      defaultValue: defaultQueryTitle,
    },
  },
  { name: 'no-default', parameter: { type: 'string', path: 'metadata.title', whenUndefined: 'ignore' } },
  {
    name: 'required',
    parameter: {
      type: 'string',
      path: 'metadata.title',
      whenUndefined: 'defaultValue',
      defaultValue: null,
      required: true,
    },
  },
];
export const namedQueryDefaultInputs = [
  { name: 'omitted', query: '', value: undefined },
  { name: 'empty', query: 'term=', value: '' },
  { name: 'value', query: 'term=' + encodeURIComponent(defaultQueryTitle), value: defaultQueryTitle },
  { name: 'operator', query: 'term[$ne]=x', value: { $ne: 'x' } },
] as const;
export function defaultReport(name: string) {
  return {
    name: 'defaults-' + name,
    title: 'Defaults ' + name,
    reportSource: 'database' as const,
    databaseQuery: { queryName: 'defaults-' + name },
    filter: [{ type: 'text', paramName: 'term', property: 'metadata.title', message: 'Title' }],
    columns: [{ label: 'Title', property: 'title' }],
    solrQuery: null,
    readOnly: false,
    canEdit: true,
    canDelete: true,
    canPreview: true,
  };
}

/** HTTP controls for conversion/template ordering and typed omitted defaults. */
export const namedQueryConversionCases: ReadonlyArray<{
  name: string;
  parameter: NamedQueryParam;
  value?: string;
  titles: string[];
  outcome?: 'refused' | 'mongo-error';
}> = [
  {
    name: 'boolean-null',
    parameter: { type: 'boolean', path: 'metadata.active', whenUndefined: 'defaultValue', defaultValue: null },
    titles: ['Private'],
  },
  {
    name: 'array-null',
    parameter: { type: 'array', path: 'metadata.defaultArray', whenUndefined: 'defaultValue', defaultValue: null },
    titles: ['Private'],
  },
  {
    name: 'boolean-typed',
    parameter: { type: 'boolean', path: 'metadata.active', whenUndefined: 'defaultValue', defaultValue: false },
    titles: ['Private'],
  },
  {
    name: 'array-typed',
    parameter: {
      type: 'array',
      path: 'metadata.defaultArray',
      whenUndefined: 'defaultValue',
      defaultValue: ['a', 'b'],
    },
    titles: [defaultQueryTitle],
  },
  {
    name: 'boolean-null-identity',
    parameter: {
      type: 'boolean',
      path: 'metadata.active',
      whenUndefined: 'defaultValue',
      defaultValue: null,
      template: '{{value}}',
    },
    titles: ['Private'],
  },
  {
    name: 'array-null-identity',
    parameter: {
      type: 'array',
      path: 'metadata.defaultArray',
      whenUndefined: 'defaultValue',
      defaultValue: null,
      template: '{{value}}',
    },
    titles: ['Private'],
  },
  {
    name: 'boolean-default-template',
    parameter: {
      type: 'boolean',
      path: 'metadata.active',
      whenUndefined: 'defaultValue',
      defaultValue: false,
      template: '{{default value true}}',
    },
    titles: [defaultQueryTitle],
  },
  {
    name: 'array-default-template',
    parameter: {
      type: 'array',
      path: 'metadata.defaultArray',
      whenUndefined: 'defaultValue',
      defaultValue: null,
      template: '{{default value \'["a","b"]\'}}',
    },
    titles: [defaultQueryTitle],
  },
  {
    name: 'number-zero-template',
    parameter: {
      type: 'number',
      path: 'metadata.rank',
      whenUndefined: 'defaultValue',
      defaultValue: null,
      template: '{{default value 10}}',
    },
    value: '0',
    titles: [defaultQueryTitle],
  },
  {
    name: 'number-empty-template',
    parameter: {
      type: 'number',
      path: 'metadata.rank',
      whenUndefined: 'defaultValue',
      defaultValue: '',
      template: '{{default value 10}}',
    },
    value: '',
    titles: ['Private'],
  },
  {
    name: 'date-empty-template',
    parameter: {
      type: 'date',
      path: 'metadata.testDate',
      whenUndefined: 'defaultValue',
      defaultValue: '',
      template: '{{default value "2026-01-02T03:04:05.000Z"}}',
    },
    value: '',
    titles: [defaultQueryTitle],
  },
  {
    name: 'array-json-template',
    parameter: { type: 'array', path: 'metadata.defaultArray', whenUndefined: 'ignore', template: '{{value}}' },
    value: '["a","b"]',
    titles: [defaultQueryTitle],
  },
  {
    name: 'string-identity',
    parameter: { type: 'string', path: 'metadata.title', whenUndefined: 'ignore', template: '{{value}}' },
    value: defaultQueryTitle,
    titles: [defaultQueryTitle],
  },
  {
    name: 'string-empty-template',
    parameter: {
      type: 'string',
      path: 'metadata.title',
      whenUndefined: 'defaultValue',
      defaultValue: null,
      template: '{{default value "Référence 🌏"}}',
    },
    value: '',
    titles: [defaultQueryTitle],
  },
  {
    name: 'date-identity',
    parameter: { type: 'date', path: 'metadata.testDate', whenUndefined: 'ignore', template: '{{value}}' },
    value: '2026-01-02T03:04:05.000Z',
    titles: [defaultQueryTitle],
  },
  {
    name: 'number-zero-identity',
    parameter: { type: 'number', path: 'metadata.rank', whenUndefined: 'ignore', template: '{{value}}' },
    value: '0',
    titles: [defaultQueryTitle],
  },
  {
    name: 'boolean-falseish-template',
    parameter: {
      type: 'boolean',
      path: 'metadata.active',
      whenUndefined: 'ignore',
      template: '{{default value true}}',
    },
    value: '0',
    titles: ['Private'],
  },
  {
    name: 'array-empty-template',
    parameter: {
      type: 'array',
      path: 'metadata.defaultArray',
      whenUndefined: 'defaultValue',
      defaultValue: '',
      template: '{{default value \'["a","b"]\'}}',
    },
    value: '',
    titles: [defaultQueryTitle],
  },
];

/** Literal operand controls, shared by named-query, report/CSV and preview HTTP cases. */
export const namedQueryLiteralCases: ReadonlyArray<{
  name: string;
  parameter: NamedQueryParam;
  value: string;
  titles: string[];
  outcome?: 'refused' | 'mongo-error';
}> = [
  ...(['schema', 'dotted'] as const).flatMap(key => {
    const literal = key === 'schema' ? { $schema: 'https://example.org/schema' } : { 'schema.org': 'Dataset' };
    // Mongo rejects a leading-$ document directly inside $in. An ordinary first
    // field keeps this a valid literal document, including its dollar/dotted keys.
    const member = { kind: 'literal', ...literal };
    const operands: { name: string; type: 'object' | 'array'; queryType: string; path: string; value: unknown }[] = [
      { name: 'object-eq', type: 'object', queryType: '$eq', path: 'metadata.literal' + key, value: literal },
      { name: 'array-eq', type: 'array', queryType: '$eq', path: 'metadata.literal' + key + 'Array', value: [literal] },
      { name: 'array-in', type: 'array', queryType: '$in', path: 'metadata.member' + key, value: [member] },
    ];
    return [
      ...operands.map(item => ({
        name: 'literal-' + key + '-' + item.name,
        parameter: { type: item.type, path: item.path, queryType: item.queryType, whenUndefined: 'ignore' as const },
        value: JSON.stringify(item.value), titles: [defaultQueryTitle],
      })),
      ...operands.map(item => ({
        name: 'interpreted-' + key + '-' + item.name,
        parameter: { type: item.type, path: item.path, whenUndefined: 'ignore' as const },
        value: JSON.stringify(item.value), titles: [], outcome: 'refused' as const,
      })),
      ...['$elemMatch', '$not', '$expr', '$where'].flatMap(queryType =>
        (['object', 'array'] as const).map(type => ({
          name: 'interpreted-' + key + '-' + type + '-' + queryType.slice(1),
          parameter: { type, path: 'metadata.literals', queryType, whenUndefined: 'ignore' as const },
          value: JSON.stringify(type === 'array' ? [literal] : literal), titles: [], outcome: 'refused' as const,
        }))),
    ];
  }),
  {
    name: 'mongo-invalid-leading-dollar-in',
    parameter: { type: 'array', path: 'metadata.memberschema', queryType: '$in', whenUndefined: 'ignore' as const },
    value: '[{"$schema":"https://example.org/schema"}]', titles: [], outcome: 'mongo-error',
  },
];
