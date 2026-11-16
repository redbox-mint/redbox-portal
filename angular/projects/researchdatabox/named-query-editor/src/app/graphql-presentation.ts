import {
  Kind,
  parse,
  print,
  getOperationAST,
  valueFromASTUntyped,
  visit,
  type DocumentNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from 'graphql';
import type { GraphqlNamedQueryDefinition, NamedQueryJson } from '@researchdatabox/sails-ng-common';
import type { NamedQueryParameterRow, NamedQueryResultField } from '@researchdatabox/portal-ng-common';
export function humanLabel(value: string): string {
  return value
    .replace(/^.*[:/]/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, c => c.toUpperCase());
}
// These getters run together during change detection. Keep one bounded parse
// rather than reparsing the same document for parameters, labels and mappings.
let cachedOperation: {
  document: string;
  name?: string;
  ast: DocumentNode;
  operation: OperationDefinitionNode | null | undefined;
} | null = null;
export function operationInfo(draft: GraphqlNamedQueryDefinition) {
  if (cachedOperation?.document === draft.graphql.document && cachedOperation.name === draft.graphql.operationName)
    return cachedOperation;
  const ast = parse(draft.graphql.document, { maxTokens: 2000 });
  cachedOperation = {
    document: draft.graphql.document,
    name: draft.graphql.operationName,
    ast,
    operation: getOperationAST(ast, draft.graphql.operationName),
  };
  return cachedOperation;
}
/** Display typed saved filter values without the GraphQL input-object wrapper. */
export function savedValueLabel(value: NamedQueryJson, depth = 0): string {
  if (depth > 12) return '…';
  if (value === null || typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map(item => savedValueLabel(item, depth + 1)).join(', ');
  if (Object.hasOwn(value, 'from') && Object.hasOwn(value, 'to'))
    return savedValueLabel(value['from'], depth + 1) + ' – ' + savedValueLabel(value['to'], depth + 1);
  return Object.entries(value)
    .map(([key, item]) =>
      ['text', 'number', 'boolean', 'datetime'].includes(key)
        ? savedValueLabel(item, depth + 1)
        : humanLabel(key) + ': ' + savedValueLabel(item, depth + 1)
    )
    .join(', ');
}

export function parameterRows(
  draft: GraphqlNamedQueryDefinition,
  text: (key: string) => string,
  labels: Record<string, string> = {},
  values: Record<string, NamedQueryJson> = {}
): NamedQueryParameterRow[] {
  try {
    const { operation } = operationInfo(draft);
    return (operation?.variableDefinitions ?? []).map(variable => {
      const name = variable.variable.name.value;
      const binding = draft.graphql.variables[name];
      const inputType = print(variable.type);
      const records = operation?.selectionSet.selections.find(
        node => node.kind === Kind.FIELD && node.name.value === 'records'
      );
      const pageVariables =
        records?.kind === Kind.FIELD
          ? (records.arguments ?? []).flatMap(arg =>
              ['first', 'after'].includes(arg.name.value) && arg.value.kind === Kind.VARIABLE
                ? [arg.value.name.value]
                : []
            )
          : [];

      const value =
        binding?.ownership === 'fixed'
          ? binding.value
          : Object.hasOwn(values, name)
            ? values[name]
            : variable.defaultValue
              ? valueFromASTUntyped(variable.defaultValue)
              : binding?.ownership === 'consumer'
                ? binding.defaultValue
                : undefined;
      const friendly: Record<string, string> = {
        type: 'record-type',
        stages: 'workflow-stage',
        sort: 'sorting',
        filters: 'conditions',
        first: 'rows-per-page',
        after: 'paging',
      };
      const label = labels[name] ?? (friendly[name] ? text(friendly[name]) : humanLabel(name));
      return {
        variable: name,
        inputType,
        value: value as NamedQueryJson | undefined,
        binding,
        label,
        paging:
          pageVariables.includes(name) ||
          [draft.graphql.lookup?.firstVariable, draft.graphql.lookup?.afterVariable].includes(name),
        consumerAllowed: !/(Input|Filter|Sort|Range)/.test(inputType),
      };
    });
  } catch {
    return [];
  }
}
/** Traverse response aliases/fragments, never schema type names, to offer literal mapping paths. */
export function selectedResultFields(
  draft: GraphqlNamedQueryDefinition,
  known: NamedQueryResultField[] = []
): NamedQueryResultField[] {
  try {
    const { ast, operation } = operationInfo(draft);
    const fragments = new Map(
      ast.definitions.flatMap(n => (n.kind === Kind.FRAGMENT_DEFINITION ? [[n.name.value, n] as const] : []))
    );
    const fields: NamedQueryResultField[] = [];
    let work = 0;
    const walk = (set: SelectionSetNode, path: string[], seen: Set<string>) => {
      if (++work > 2000 || path.length > 16) return;
      for (const node of set.selections) {
        if (node.kind === Kind.FIELD && node.name.value === '__typename') continue;
        if (node.kind === Kind.INLINE_FRAGMENT) {
          walk(node.selectionSet, path, seen);
          continue;
        }
        if (node.kind === Kind.FRAGMENT_SPREAD) {
          if (!seen.has(node.name.value) && fragments.has(node.name.value))
            walk(fragments.get(node.name.value)!.selectionSet, path, new Set([...seen, node.name.value]));
          continue;
        }
        const next = [...path, node.alias?.value ?? node.name.value];
        if (next.length > draft.graphql.resultPath.length && draft.graphql.resultPath.every((v, i) => next[i] === v)) {
          const relative = next.slice(draft.graphql.resultPath.length);
          const field = known.find(f => JSON.stringify(f.path) === JSON.stringify(relative));
          fields.push({
            label: field?.label ?? humanLabel(node.name.value),
            path: relative,
            type: node.selectionSet ? 'object' : (field?.type ?? 'text'),
          });
        }
        if (node.selectionSet) walk(node.selectionSet, next, seen);
      }
    };
    if (operation) walk(operation.selectionSet, [], new Set());
    return fields.filter((f, i, a) => a.findIndex(x => JSON.stringify(x.path) === JSON.stringify(f.path)) === i);
  } catch {
    return [];
  }
}
export function recordType(draft: GraphqlNamedQueryDefinition): string | null {
  try {
    const { operation } = operationInfo(draft);
    const records = operation?.selectionSet.selections.find(n => n.kind === Kind.FIELD && n.name.value === 'records');
    if (!records || records.kind !== Kind.FIELD) return null;
    const value = records.arguments?.find(a => a.name.value === 'recordType')?.value;
    if (value?.kind === Kind.STRING) return value.value;
    if (value?.kind === Kind.VARIABLE) {
      const binding = draft.graphql.variables[value.name.value];
      return binding?.ownership === 'fixed' && typeof binding.value === 'string' ? binding.value : null;
    }
  } catch {
    /* Invalid documents remain editable. */
  }
  return null;
}

/** Describe published conditions from their own document, even after the source changes. */
export function conditionLabels(
  draft: GraphqlNamedQueryDefinition,
  fields: Record<string, string>,
  text: (key: string) => string
): Record<string, string> {
  try {
    const { operation } = operationInfo(draft);
    const records = operation?.selectionSet.selections.find(
      node => node.kind === Kind.FIELD && node.name.value === 'records'
    );
    const filters =
      records?.kind === Kind.FIELD
        ? records.arguments?.find(argument => argument.name.value === 'filters')?.value
        : null;
    if (filters?.kind !== Kind.LIST) return {};
    return Object.fromEntries(
      filters.values.flatMap(filter => {
        if (filter.kind !== Kind.OBJECT) return [];
        const field = filter.fields.find(item => item.name.value === 'field')?.value;
        if (field?.kind !== Kind.STRING) return [];
        return filter.fields
          .filter(item => item.name.value !== 'field')
          .flatMap(operator => {
            const labels: [string, string][] = [];
            visit(operator.value, {
              Variable(node) {
                labels.push([
                  node.name.value,
                  (fields[field.value] ?? humanLabel(field.value)) +
                    ' ' +
                    text('op-' + operator.name.value).toLocaleLowerCase(),
                ]);
              },
            });
            return labels;
          });
      })
    );
  } catch {
    return {};
  }
}

/** Schema discriminators are implementation details, not preview data. */
export function previewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(previewValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '__typename')
        .map(([key, item]) => [key, previewValue(item)])
    );
  return value;
}
export function previewRows(rows: unknown[], fields: NamedQueryResultField[]): unknown[] {
  const leaves = fields.filter(
    field =>
      !fields.some(
        other => other.path.length > field.path.length && field.path.every((part, index) => other.path[index] === part)
      )
  );
  return rows.map(row =>
    Object.fromEntries(
      leaves.map((field, index) => {
        let value = row;
        for (const part of field.path)
          value =
            value && typeof value === 'object' && Object.hasOwn(value, part)
              ? (value as Record<string, unknown>)[part]
              : undefined;
        const label =
          leaves.findIndex(other => other.label === field.label) === index
            ? field.label
            : field.label + ' (' + (index + 1) + ')';
        return [label, previewValue(value)];
      })
    )
  );
}
