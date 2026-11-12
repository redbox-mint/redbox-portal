import {
  Kind,
  parse,
  print,
  valueFromASTUntyped,
  type ValueNode,
  type OperationDefinitionNode,
  parseType,
  visit,
} from 'graphql';
import type {
  NamedQueryJson,
  NamedQueryPromotionDraft,
  GraphqlNamedQueryDefinition,
} from '@researchdatabox/sails-ng-common';
import type { NamedQueryResultField } from '@researchdatabox/portal-ng-common';
import type { GridField, SavedQuery } from './data-grid.model';

export interface PublishVariable {
  name: string;
  inputType: string;
  label: string;
  value?: import('@researchdatabox/sails-ng-common').NamedQueryJson;
  consumerAllowed: boolean;
}
const literal = (value: unknown): ValueNode =>
  value === null
    ? { kind: Kind.NULL }
    : Array.isArray(value)
      ? { kind: Kind.LIST, values: value.map(literal) }
      : typeof value === 'object'
        ? {
            kind: Kind.OBJECT,
            fields: Object.entries(value!).map(([name, v]) => ({
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: name },
              value: literal(v),
            })),
          }
        : typeof value === 'boolean'
          ? { kind: Kind.BOOLEAN, value }
          : typeof value === 'number'
            ? { kind: Number.isInteger(value) ? Kind.INT : Kind.FLOAT, value: String(value) }
            : { kind: Kind.STRING, value: String(value) };

/** Expand generated filter inputs into readable, individually bindable conditions. Raw documents are retained verbatim. */
export function initializePublish(
  prepared: NamedQueryPromotionDraft,
  exploration: SavedQuery | null,
  labels: Record<string, string>,
  text: (key: string) => string
): { draft: GraphqlNamedQueryDefinition; variables: PublishVariable[] } {
  const draft = structuredClone(prepared.definition);
  const values = structuredClone(prepared.variableValues);
  const ast = parse(draft.graphql.document, { maxTokens: 2000 });
  let operation = ast.definitions.find(n => n.kind === Kind.OPERATION_DEFINITION) as OperationDefinitionNode;
  const customLabels: Record<string, string> = {};
  if (exploration && exploration.mode !== 'graphql' && Array.isArray(values['filters'])) {
    const filters = values['filters'];
    const definitions = [...(operation.variableDefinitions ?? [])].filter(v => v.variable.name.value !== 'filters');
    const inputs = filters.map((filter, index) => {
      const object = filter as Record<string, unknown>;
      const operator = Object.keys(object).find(k => k !== 'field')!;
      const value = object[operator];
      const node = literal(object);
      const scalarKey = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value)[0] : null;
      const scalar = scalarKey ? (value as Record<string, unknown>)[scalarKey] : value;
      if (
        ['contains', 'iprefix', 'eq', 'gt', 'lt', 'exists'].includes(operator) &&
        ['string', 'number', 'boolean'].includes(typeof scalar) &&
        node.kind === Kind.OBJECT
      ) {
        const name = 'condition_' + (index + 1);
        values[name] = scalar as string | number | boolean;
        const inputType = typeof scalar === 'boolean' ? 'Boolean!' : typeof scalar === 'number' ? 'Float!' : 'String!';
        definitions.push({
          kind: Kind.VARIABLE_DEFINITION,
          variable: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: name } },
          type: parseType(inputType),
        });
        customLabels[name] =
          (labels[String(object['field'])] ?? String(object['field'])) +
          ' ' +
          text('op-' + operator).replace(/^./, c => c.toLocaleLowerCase());
        const variable: ValueNode = { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: name } };
        return {
          ...node,
          fields: node.fields.map(field =>
            field.name.value !== operator
              ? field
              : {
                  ...field,
                  value: scalarKey
                    ? {
                        kind: Kind.OBJECT as const,
                        fields: [
                          {
                            kind: Kind.OBJECT_FIELD as const,
                            name: { kind: Kind.NAME as const, value: scalarKey },
                            value: variable,
                          },
                        ],
                      }
                    : variable,
                }
          ),
        };
      }
      // Compound conditions stay fixed but still appear in the condition table.
      if (['in', 'between'].includes(operator) && node.kind === Kind.OBJECT) {
        const name = 'condition_' + (index + 1);
        values[name] = value as NamedQueryJson;
        definitions.push({
          kind: Kind.VARIABLE_DEFINITION,
          variable: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: name } },
          type: parseType(operator === 'in' ? '[RecordFilterValue!]!' : 'RecordFilterRange!'),
        });
        customLabels[name] =
          (labels[String(object['field'])] ?? String(object['field'])) +
          ' ' +
          text('op-' + operator).replace(/^./, c => c.toLocaleLowerCase());
        return {
          ...node,
          fields: node.fields.map(field =>
            field.name.value !== operator
              ? field
              : { ...field, value: { kind: Kind.VARIABLE as const, name: { kind: Kind.NAME as const, value: name } } }
          ),
        };
      }
      return node;
    });
    operation = {
      ...operation,
      variableDefinitions: definitions,
      selectionSet: {
        ...operation.selectionSet,
        selections: operation.selectionSet.selections.map(root =>
          root.kind !== Kind.FIELD || root.name.value !== 'records'
            ? root
            : {
                ...root,
                arguments: root.arguments?.map(arg =>
                  arg.name.value === 'filters' ? { ...arg, value: { kind: Kind.LIST as const, values: inputs } } : arg
                ),
              }
        ),
      },
    };
    draft.graphql.document = print({
      ...ast,
      definitions: ast.definitions.map(n => (n.kind === Kind.OPERATION_DEFINITION ? operation : n)),
    });
    delete values['filters'];
    delete draft.graphql.variables['filters'];
  }
  const friendly: Record<string, string> = {
    type: text('record-type'),
    stages: text('workflow-stage'),
    sort: text('sorting'),
    filters: text('conditions'),
    first: text('rows-per-page'),
    after: text('paging'),
  };
  const variables = (operation.variableDefinitions ?? []).map(v => {
    const name = v.variable.name.value;
    const inputType = print(v.type);
    const value: NamedQueryJson | undefined = Object.hasOwn(values, name)
      ? values[name]
      : v.defaultValue
        ? (valueFromASTUntyped(v.defaultValue) as NamedQueryJson)
        : undefined;
    if (
      !draft.graphql.variables[name] &&
      ![draft.graphql.lookup?.firstVariable, draft.graphql.lookup?.afterVariable].includes(name)
    )
      draft.graphql.variables[name] = value === undefined ? { ownership: 'omitted' } : { ownership: 'fixed', value };
    return {
      name,
      inputType,
      label: customLabels[name] ?? friendly[name] ?? name,
      value,
      consumerAllowed: !/(Input|Filter|Sort)/.test(inputType),
    };
  });
  return { draft, variables };
}

/** Build a read-only explorer preview; GraphQL still validates/coerces the actual operation on the server. */
export function publishPreviewVariables(
  definition: GraphqlNamedQueryDefinition,
  parameters: Record<string, string>
): Record<string, unknown> {
  const variables: Record<string, unknown> = Object.create(null);
  for (const [name, binding] of Object.entries(definition.graphql.variables)) {
    if (binding.ownership === 'fixed') variables[name] = structuredClone(binding.value);
    else if (binding.ownership === 'consumer') {
      if (!Object.hasOwn(parameters, binding.parameter)) {
        if (binding.defaultValue !== undefined) variables[name] = structuredClone(binding.defaultValue);
        continue;
      }
      const value = parameters[binding.parameter];
      // Text and enum values remain text; numeric/boolean/list controls use JSON syntax.
      variables[name] =
        /^(Int|Float|Boolean)[!]?$/u.test(binding.inputType) || binding.inputType.startsWith('[')
          ? JSON.parse(value)
          : value;
    }
  }
  return variables;
}

/** A saved visual field may have one internal alias per form variant. Publish
 * its compatible scalar selections under one response key so a dropdown maps
 * the same field in every variant. Handwritten GraphQL never uses this rewrite.
 */
export function visualPublicationProjection(
  document: string,
  fields: GridField[]
): { document: string; fields: NamedQueryResultField[] } {
  const aliases = new Map<string, string>();
  const common = new Map<string, string>();
  for (const field of fields) {
    if (!field.id.startsWith('metadata:') || field.partial || ['structured', 'unavailable'].includes(field.type))
      continue;
    const parts = field.id.slice('metadata:'.length).split('/').slice(1);
    for (const selection of field.selections ?? [])
      for (const [index, alias] of selection.responsePath.slice(1).entries()) {
        const key = JSON.stringify(parts.slice(0, index + 1));
        if (!common.has(key)) common.set(key, 'explorer_field_' + (common.size + 1));
        aliases.set(alias, common.get(key)!);
      }
  }
  const ast = visit(parse(document, { maxTokens: 2000 }), {
    Field(node) {
      const alias = node.alias && aliases.get(node.alias.value);
      return alias ? { ...node, alias: { ...node.alias!, value: alias } } : undefined;
    },
  });
  const result = fields.flatMap(field =>
    (field.selections ?? []).map(selection => ({
      label: field.label,
      path: selection.responsePath.map(part => aliases.get(part) ?? part),
      type: field.type,
    }))
  );
  return {
    document: print(ast),
    fields: result.filter(
      (field, i, all) => all.findIndex(f => JSON.stringify(f.path) === JSON.stringify(field.path)) === i
    ),
  };
}
