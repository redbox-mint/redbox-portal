import { SourceFile, SyntaxKind } from 'ts-morph';

/** Follow defineController's create expression, rather than guessing export/class names. */
export function controllerFactory(source: SourceFile) {
  const defineNames = source
    .getImportDeclarations()
    .filter(declaration => declaration.getModuleSpecifierValue() === '@researchdatabox/redbox-core/http')
    .flatMap(declaration => declaration.getNamedImports())
    .filter(specifier => specifier.getName() === 'defineController')
    .map(specifier => specifier.getAliasNode()?.getText() ?? specifier.getName());
  const factories = source.getVariableDeclarations().filter(variable => {
    const call = variable.getInitializerIfKind(SyntaxKind.CallExpression);
    return variable.isExported() && call && defineNames.includes(call.getExpression().getText());
  });
  if (factories.length !== 1)
    throw new Error(
      'Generate an API2 controller first; legacy controllers require explicit conversion (expected one exported defineController factory).'
    );
  const factory = factories[0]!;
  const descriptor = factory
    .getInitializerIfKindOrThrow(SyntaxKind.CallExpression)
    .getArguments()[0]!
    .asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const create = descriptor
    .getPropertyOrThrow('create')
    .asKindOrThrow(SyntaxKind.PropertyAssignment)
    .getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction);
  const construction = create.getFirstDescendantByKindOrThrow(SyntaxKind.NewExpression);
  const targetClass = source.getClassOrThrow(construction.getExpression().getText());
  const input = source.getInterfaceOrThrow(create.getParameters()[0]!.getTypeNodeOrThrow().getText());
  const name = descriptor
    .getPropertyOrThrow('name')
    .asKindOrThrow(SyntaxKind.PropertyAssignment)
    .getInitializerIfKindOrThrow(SyntaxKind.StringLiteral)
    .getLiteralValue();
  const actions = descriptor
    .getPropertyOrThrow('actions')
    .asKindOrThrow(SyntaxKind.PropertyAssignment)
    .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  return { factory, targetClass, input, name, actions };
}
