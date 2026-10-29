import {
  handlebarsInstance,
  normaliseVisual,
  pathSegments,
  reportDisplayTemplateFields,
  reportCsvTemplateFields,
  type ContextSchemaField,
  type EditorDiagnostic,
  type NamedQueryDescription,
  type ReportConfigDto,
} from '@researchdatabox/sails-ng-common';
import * as _ from 'lodash';

export const reportDiagnostic = (
  code: string,
  field: string,
  reason: string,
  severity: 'warning' | 'error' = 'warning'
): EditorDiagnostic => ({ code, field: field.slice(0, 256), reason, severity, line: 0, column: 0 });

/** The existing save contract checks required fields, not templates or query bindings. */
export function reportStructure(config: unknown): EditorDiagnostic[] {
  if (!_.isPlainObject(config))
    return [reportDiagnostic('INVALID_REPORT', 'report', 'A report configuration object is required.', 'error')];
  const value = config as Record<string, unknown>;
  const diagnostics: EditorDiagnostic[] = [];
  const error = (field: string, reason: string) =>
    diagnostics.push(reportDiagnostic('INVALID_REPORT', field, reason, 'error'));
  if (typeof value.name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value.name))
    error('name', 'A URL-safe report name is required.');
  if (typeof value.title !== 'string' || !value.title) error('title', 'A report title is required.');
  if (value.reportSource != null && value.reportSource !== 'database')
    error('reportSource', 'Solr reports are read-only.');
  if (
    !_.isPlainObject(value.databaseQuery) ||
    typeof _.get(value, 'databaseQuery.queryName') !== 'string' ||
    !_.get(value, 'databaseQuery.queryName')
  )
    error('databaseQuery.queryName', 'A saved named query is required.');
  for (const key of ['columns', 'filter']) {
    const items = value[key];
    if (items != null && !Array.isArray(items)) {
      error(key, 'An array is required.');
      continue;
    }
    if (!Array.isArray(items)) continue;
    items.forEach((item: unknown, i) => {
      if (!_.isPlainObject(item)) {
        error(`${key}.${i}`, 'An object is required.');
        return;
      }
      if (key === 'columns') {
        for (const name of ['label', 'property'])
          if (typeof _.get(item, name) !== 'string' || !_.get(item, name))
            error(`${key}.${i}.${name}`, 'Column label and property are required.');
        for (const name of ['template', 'exportTemplate'])
          if (_.get(item, name) != null && typeof _.get(item, name) !== 'string')
            error(`${key}.${i}.${name}`, 'Template source must be a string.');
      } else if (_.get(item, 'type') === 'date-range') {
        for (const name of ['fromProperty', 'toProperty'])
          if (typeof _.get(item, `database.${name}`) !== 'string' || !_.get(item, `database.${name}`))
            error(`${key}.${i}.database.${name}`, 'Database date filters require parameter keys for both bounds.');
      }
    });
  }
  return diagnostics;
}

const parts = (field: ContextSchemaField) => pathSegments(field.path).map(part => part.name);
const equal = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Unknown objects and incomplete/hook descriptions are open, rather than guessed schemas. */
function missing(path: string[], fields: ContextSchemaField[], complete: boolean, mapped: boolean): boolean {
  if (!path.length) return false;
  const candidates = fields.map(field => ({ field, path: parts(field) }));
  const indexed: string[] = [];
  for (const segment of path) {
    if (
      /^\d+$/.test(segment) &&
      candidates.some(candidate => candidate.field.isArray && equal(candidate.path, indexed))
    )
      continue;
    indexed.push(segment);
  }
  path = indexed;
  if (candidates.some(candidate => equal(candidate.path, path))) return false;
  for (let length = path.length - 1; length > 0; length--) {
    const parent = candidates.find(candidate => equal(candidate.path, path.slice(0, length)));
    if (!parent) continue;
    if (parent.field.type.includes('unknown')) return false;
    if (parent.field.type === 'undefined') return true;
    if (length === 1 && path[0] === 'metadata' && mapped) return true;
    if (['object', 'array'].some(type => parent.field.type.includes(type)))
      return (
        complete &&
        candidates.some(
          candidate => candidate.path.length > length && equal(candidate.path.slice(0, length), parent.path)
        )
      );
    return true;
  }
  // Named-query envelopes and report runtime roots are fixed, even without schema guidance.
  return path[0] !== 'metadata' || complete || mapped;
}

interface Ast {
  type: string;
  original?: string;
  parts?: string[];
  data?: boolean;
  depth?: number;
  path?: Ast;
  params?: Ast[];
  hash?: { pairs: Array<{ value: Ast }> };
  body?: Ast[];
  program?: Ast;
  inverse?: Ast;
  blockParams?: string[];
  loc?: { start: { line: number; column: number } };
}

export function reportTemplateAdvice(
  source: string,
  fields: ContextSchemaField[],
  location: string,
  complete: boolean,
  mapped: boolean
): EditorDiagnostic[] {
  if (!source) return [];
  if ((source.match(/\{\{/g) ?? []).length > 256)
    return [
      reportDiagnostic(
        'TEMPLATE_COMPLEXITY',
        location,
        'Template assistance is limited to 256 expressions; simplify this template before previewing.'
      ),
    ];
  const diagnostics: EditorDiagnostic[] = [];
  try {
    const ast = handlebarsInstance().parse(normaliseVisual(source)) as Ast;
    const helpers = handlebarsInstance().helpers;
    type Scope = { base: string[] | null; parents: Array<string[] | null>; aliases: Map<string, string[] | null> };
    const resolve = (node: Ast, scope: Scope): string[] | null => {
      // Helper/subexpression output has no statically known context path.
      if (node.type !== 'PathExpression') return null;
      const segments = [...(node.parts ?? [])];
      if (node.data) return segments.shift() === 'root' ? segments : null;
      const alias = segments[0];
      if (scope.aliases.has(alias)) {
        const base = scope.aliases.get(alias);
        return base ? [...base, ...segments.slice(1)] : null;
      }
      const base = node.depth ? scope.parents[node.depth - 1] : scope.base;
      return base ? [...base, ...segments] : null;
    };
    const walk = (node: Ast, scope: Scope): void => {
      if (diagnostics.length >= 100) return;
      if (node.type === 'PathExpression') {
        const path = resolve(node, scope);
        if (path && missing(path, fields, complete, mapped)) {
          const diagnostic = reportDiagnostic(
            'UNKNOWN_TEMPLATE_REFERENCE',
            location,
            `This reference is absent from the known report context: ${String(node.original).slice(0, 160)}. Hook/dynamic output may still provide it.`
          );
          diagnostic.line = node.loc?.start.line ?? 0;
          diagnostic.column = (node.loc?.start.column ?? -1) + 1;
          diagnostics.push(diagnostic);
        }
        return;
      }
      if (node.path) {
        const name = node.path.original ?? '';
        if (
          node.type !== 'SubExpression' &&
          !Object.hasOwn(helpers, name) &&
          !(node.params?.length || node.hash?.pairs.length)
        )
          walk(node.path, scope);
        for (const param of node.params ?? []) walk(param, scope);
        for (const pair of node.hash?.pairs ?? []) walk(pair.value, scope);
        let nested = scope;
        if (['each', 'with'].includes(name) && node.params?.[0]) {
          const base = resolve(node.params[0], scope);
          const aliases = new Map(scope.aliases);
          if (node.program?.blockParams?.[0]) aliases.set(node.program.blockParams[0], base);
          if (node.program?.blockParams?.[1]) aliases.set(node.program.blockParams[1], null);
          nested = { base, parents: [scope.base, ...scope.parents], aliases };
        } else if (node.type === 'BlockStatement' && !['if', 'unless'].includes(name)) {
          // Registered and unregistered custom helpers may supply arbitrary
          // contexts and block parameters, including to their inverse branch.
          const aliases = new Map(scope.aliases);
          for (const alias of node.program?.blockParams ?? []) aliases.set(alias, null);
          nested = { base: null, parents: scope.parents.map(() => null), aliases };
        }
        if (node.program) walk(node.program, nested);
        if (node.inverse) walk(node.inverse, ['each', 'with', 'if', 'unless'].includes(name) ? scope : nested);
      }
      for (const child of node.body ?? []) walk(child, scope);
    };
    walk(ast, { base: [], parents: [], aliases: new Map() });
  } catch {
    diagnostics.push(
      reportDiagnostic(
        'TEMPLATE_SYNTAX',
        location,
        'Invalid Handlebars syntax. Legacy saves allow this; runtime renders a failed template as empty text.'
      )
    );
  }
  return diagnostics;
}

export function reportBindingAdvice(
  config: ReportConfigDto,
  description: NamedQueryDescription,
  mapped: boolean
): EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = [];
  config.filter.forEach((filter, i) => {
    const binding = (key: string, field: string, date: boolean) => {
      const parameter = description.parameters.find(parameter => parameter.key === key);
      if (!parameter)
        diagnostics.push(
          reportDiagnostic(
            'UNKNOWN_QUERY_PARAMETER',
            field,
            'Select a query parameter key, not its record path. This key is absent from the selected saved query.'
          )
        );
      else if (date && !['date', 'string', 'unknown'].includes(parameter.type))
        diagnostics.push(
          reportDiagnostic(
            'INCOMPATIBLE_DATE_PARAMETER',
            field,
            'Date filters supply ISO timestamp strings; this query parameter expects another value type.'
          )
        );
      else if (date && parameter.type === 'date' && parameter.format === 'days' && parameter.queryType)
        diagnostics.push(
          reportDiagnostic(
            'INCOMPATIBLE_DATE_PARAMETER',
            field,
            'This query parameter expects a number of days; the report date filter supplies an ISO timestamp.'
          )
        );
    };
    if (filter.type === 'text') binding(filter.paramName, `filter.${i}.paramName`, false);
    if (filter.type === 'date-range')
      for (const key of ['fromProperty', 'toProperty'] as const)
        binding(filter.database?.[key] ?? '', `filter.${i}.database.${key}`, true);
  });
  const { fields, completeness } = description.result;
  config.columns.forEach((column, i) => {
    const path = _.toPath(column.property);
    const unindexedArray = fields.some(
      field =>
        field.isArray &&
        parts(field).length < path.length &&
        equal(parts(field), path.slice(0, parts(field).length)) &&
        !/^\d+$/.test(path[parts(field).length])
    );
    if (unindexedArray)
      diagnostics.push(
        reportDiagnostic(
          'UNKNOWN_OUTPUT_COLUMN',
          `columns.${i}.property`,
          'A column lookup cannot traverse array items implicitly. Select the array itself with multivalue rendering, or use an explicit numeric index.'
        )
      );
    else if (missing(path, fields, completeness === 'complete', mapped))
      diagnostics.push(
        reportDiagnostic(
          'UNKNOWN_OUTPUT_COLUMN',
          `columns.${i}.property`,
          'This property is absent from the selected query output. Mapping aliases belong under metadata.<alias>; saved report edits are preserved.'
        )
      );
    const selected = fields.find(field => equal(parts(field), path));
    if (selected?.isArray && !column.multivalue)
      diagnostics.push(
        reportDiagnostic(
          'ARRAY_WITHOUT_MULTIVALUE',
          `columns.${i}.multivalue`,
          'This output is an array. Enable multivalue to render each item; otherwise display val is undefined and CSV val contains the whole array. A template can handle the whole array explicitly.'
        )
      );
    for (const [key, adapter] of [
      ['template', reportDisplayTemplateFields],
      ['exportTemplate', reportCsvTemplateFields],
    ] as const)
      diagnostics.push(
        ...reportTemplateAdvice(
          column[key] ?? '',
          adapter(fields, column.property, !!column.multivalue),
          `columns.${i}.${key}`,
          completeness === 'complete',
          mapped
        )
      );
    // The display template is also the CSV fallback, with a different val contract.
    if (!column.exportTemplate && column.template)
      diagnostics.push(
        ...reportTemplateAdvice(
          column.template,
          reportCsvTemplateFields(fields, column.property, !!column.multivalue),
          `columns.${i}.template`,
          completeness === 'complete',
          mapped
        )
      );
  });
  return diagnostics;
}

export function displayedReportDiagnostics(diagnostics: EditorDiagnostic[]): EditorDiagnostic[] {
  return [
    ...diagnostics.filter(item => item.severity === 'error'),
    ...diagnostics.filter(item => item.severity !== 'error'),
  ].slice(0, 200);
}
