import { Kind, parse, visit } from 'graphql';

/** Recognize only a direct collection with explicit first/after variables and page-info selections.
 * Fragments/directives/aliased child fields remain usable through non-paginated JSON/grid mode. */
export function cursorBinding(document: string, variables: Record<string, unknown>, path: string[]) {
  try {
    const ast = parse(document, { maxTokens: 2000 });
    const ops = ast.definitions.filter(node => node.kind === Kind.OPERATION_DEFINITION);
    if (ops.length !== 1 || ops[0].selectionSet.selections.length !== 1) return null;
    const root = ops[0].selectionSet.selections[0];
    if (root.kind !== Kind.FIELD || root.name.value !== 'records' || root.directives?.length) return null;
    const key = root.alias?.value ?? root.name.value;
    if (path.join('.') !== `${key}.nodes`) return null;
    const args = root.arguments ?? [];
    const first = args.find(arg => arg.name.value === 'first')?.value;
    const after = args.find(arg => arg.name.value === 'after')?.value;
    if (first?.kind !== Kind.VARIABLE || after?.kind !== Kind.VARIABLE) return null;
    let cursorReferences = 0;
    visit(ast, {
      Variable(node) {
        if (node.name.value === after.name.value) cursorReferences++;
      },
    });
    // One declaration and one argument use: paging must not alter another argument.
    if (cursorReferences !== 2) return null;
    const cursorDefault = ops[0].variableDefinitions?.find(
      node => node.variable.name.value === after.name.value
    )?.defaultValue;
    if (cursorDefault && cursorDefault.kind !== Kind.NULL) return null;
    const size = variables[first.name.value];
    if (size !== 25 && size !== 50) return null;
    const children = root.selectionSet?.selections;
    if (
      !children ||
      !['nodes', 'hasNextPage', 'endCursor'].every(name =>
        children.some(
          node => node.kind === Kind.FIELD && node.name.value === name && !node.alias && !node.directives?.length
        )
      )
    )
      return null;
    return { root: key, after: after.name.value, size };
  } catch {
    return null;
  }
}
