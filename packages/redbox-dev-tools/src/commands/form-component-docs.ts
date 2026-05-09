import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import {
  ArrayLiteralExpression,
  ClassDeclaration,
  Expression,
  InterfaceDeclaration,
  Node,
  ObjectLiteralExpression,
  Project,
  PropertySignature,
  SourceFile,
  SyntaxKind,
  Type,
  VariableDeclaration,
} from 'ts-morph';

export interface FormComponentDocsOptions {
  rootDir: string;
  outputPath?: string;
  includeInternal?: boolean;
}

export interface FormComponentDocEntry {
  componentClass: string;
  modelClass?: string;
  layoutClasses: string[];
  availability: 'top-level' | 'nested/internal';
  componentConfigType?: string;
  modelConfigType?: string;
  valueType?: string;
  defaults: Record<string, unknown>;
  componentConfigProperties: DocProperty[];
  modelConfigProperties: DocProperty[];
  sharedProperties: DocProperty[];
  example: string;
}

export interface DocProperty {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

interface InternalDocProperty extends DocProperty {
  sourceInterface: string;
}

interface DocsMetadata {
  sharedFormProperties: DocProperty[];
  sharedComponentConfigProperties: DocProperty[];
  sharedModelConfigProperties: DocProperty[];
  availableLayoutClasses: string[];
}

interface FormComponentDefinitionRecord {
  componentClass: string;
  definitionClassName: string;
  sourceFile: SourceFile;
}

type FormComponentDocsCollection = FormComponentDocEntry[] & {
  [docsMetadataSymbol]?: DocsMetadata;
};

const docsMetadataSymbol = Symbol('form-component-docs-metadata');
const FORM_COMPONENT_DEFINITION_KIND = 'FormComponentDefinitionKind';
const REUSABLE_COMPONENT_NAME = 'ReusableComponent';

export function collectCoreFormComponentDocs(options: FormComponentDocsOptions): FormComponentDocEntry[] {
  const project = createDocsProject(options.rootDir);
  const metadata = collectSharedDocsMetadata(project);
  const availableFormComponentClasses = collectAvailableTopLevelComponentClasses(project);

  const entries = collectFormComponentDefinitionRecords(project)
    .map(record => buildFormComponentDocEntry(project, record, metadata, availableFormComponentClasses))
    .filter((entry): entry is FormComponentDocEntry => entry != null)
    .filter(entry => options.includeInternal || entry.availability === 'top-level')
    .sort((left, right) => left.componentClass.localeCompare(right.componentClass));

  Object.defineProperty(entries, docsMetadataSymbol, {
    value: metadata,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return entries;
}

export function renderFormComponentDocsMarkdown(entries: FormComponentDocEntry[]): string {
  const metadata = (entries as FormComponentDocsCollection)[docsMetadataSymbol] ?? {
    sharedFormProperties: dedupeDocProperties(entries.flatMap(entry => entry.sharedProperties)),
    sharedComponentConfigProperties: [],
    sharedModelConfigProperties: [],
    availableLayoutClasses: [],
  };

  const sections: string[] = [
    '# Configurable Form Components',
    '',
    '> Generated from `packages/sails-ng-common/src/config`. Do not edit component tables by hand.',
    '',
    '## How To Read This Page',
    '',
    '- This page documents the built-in configurable form components registered in core ReDBox.',
    '- Top-level components can be used directly in form config `fields` arrays.',
    '- Nested/internal components are helper structures used inside other component configs or migration flows.',
    '- Shared properties apply to every component before any component-specific config is considered.',
    '',
    '## Shared Form Component Properties',
    '',
    renderPropertyTable(metadata.sharedFormProperties),
    '',
    '## Shared Component Config Properties',
    '',
    renderPropertyTable(metadata.sharedComponentConfigProperties),
    '',
    '## Shared Model Config Properties',
    '',
    renderPropertyTable(metadata.sharedModelConfigProperties),
    '',
    '## Components',
    '',
  ];

  for (const entry of entries) {
    sections.push(`### ${entry.componentClass}`);
    sections.push('');
    sections.push(`- Availability: ${entry.availability}`);
    sections.push(`- Model: ${entry.modelClass ?? 'none'}`);
    if (entry.valueType) {
      sections.push(`- Value type: ${entry.valueType}`);
    }
    sections.push(`- Default layout: ${renderLayoutSummary(entry.layoutClasses, metadata.availableLayoutClasses)}`);
    sections.push('');
    sections.push('#### Component Config');
    sections.push('');
    if (entry.componentConfigProperties.length === 0) {
      sections.push('This component has no component-specific config properties beyond the shared component config.');
    } else {
      sections.push(renderPropertyTable(entry.componentConfigProperties));
    }
    sections.push('');
    sections.push('#### Model Config');
    sections.push('');
    if (!entry.modelClass) {
      sections.push('This component does not define a model.');
    } else if (entry.modelConfigProperties.length === 0) {
      sections.push('This component has no model-specific config properties beyond the shared model config.');
    } else {
      sections.push(renderPropertyTable(entry.modelConfigProperties));
    }
    sections.push('');
    sections.push('#### Example');
    sections.push('');
    sections.push('```ts');
    sections.push(entry.example);
    sections.push('```');
    sections.push('');
  }

  return sections.join('\n').trimEnd() + '\n';
}

export function registerFormComponentDocsCommand(program: Command): void {
  program
    .command('form-component-docs')
    .description('Generate Markdown documentation for built-in configurable form components')
    .requiredOption('--output <path>', 'Path to write the generated Markdown output')
    .option('--check', 'Fail if the current output file differs from generated content', false)
    .option('--include-internal', 'Include nested/internal components in the output', false)
    .action((options: { output: string; check?: boolean; includeInternal?: boolean }) => {
      try {
        const globalOptions = program.opts();
        const rootDir = resolveRepoRoot(globalOptions.root);
        const outputPath = path.isAbsolute(options.output)
          ? options.output
          : path.resolve(rootDir, options.output);
        const entries = collectCoreFormComponentDocs({
          rootDir,
          outputPath,
          includeInternal: options.includeInternal,
        });
        const markdown = renderFormComponentDocsMarkdown(entries);

        if (options.check) {
          if (!fs.existsSync(outputPath)) {
            throw new Error(`Generated output file does not exist: ${outputPath}`);
          }
          const existing = fs.readFileSync(outputPath, 'utf8');
          if (existing !== markdown) {
            throw new Error(`Generated output is stale: ${outputPath}`);
          }
          console.log(`✅ Generated form component docs are current: ${outputPath}`);
          return;
        }

        if (globalOptions.dryRun) {
          console.log('[dry-run] Generated form component docs; no file written.');
          return;
        }

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, markdown, 'utf8');
        console.log(`✅ Wrote generated form component docs: ${outputPath}`);
      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}

function createDocsProject(rootDir: string): Project {
  const tsconfigPath = path.join(rootDir, 'packages', 'sails-ng-common', 'tsconfig.prod.json');
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error(`Unable to find sails-ng-common tsconfig at ${tsconfigPath}`);
  }

  return new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: false,
  });
}

function collectSharedDocsMetadata(project: Project): DocsMetadata {
  const formComponentOutline = getSourceFileOrThrow(project, 'packages/sails-ng-common/src/config/form-component.outline.ts');
  const baseFieldComponentOutline = getSourceFileOrThrow(
    project,
    'packages/sails-ng-common/src/config/base-field-component.outline.ts'
  );
  const fieldComponentOutline = getSourceFileOrThrow(project, 'packages/sails-ng-common/src/config/field-component.outline.ts');
  const fieldModelOutline = getSourceFileOrThrow(project, 'packages/sails-ng-common/src/config/field-model.outline.ts');
  const baseFieldComponentModel = getSourceFileOrThrow(
    project,
    'packages/sails-ng-common/src/config/base-field-component.model.ts'
  );
  const fieldModelModel = getSourceFileOrThrow(project, 'packages/sails-ng-common/src/config/field-model.model.ts');

  const sharedFormProperties = toPublicDocProperties(
    collectInterfaceProperties(getInterfaceOrThrow(formComponentOutline, 'FormComponentDefinitionOutline'))
  );
  const sharedComponentConfigProperties = applyDefaultsToDocProperties(
    collectInterfaceProperties(getInterfaceOrThrow(fieldComponentOutline, 'FieldComponentConfigOutline')),
    collectClassDefaults(getClassOrThrow(baseFieldComponentModel, 'BaseFieldComponentConfig'))
  );
  const sharedModelConfigProperties = applyDefaultsToDocProperties(
    collectInterfaceProperties(getInterfaceOrThrow(fieldModelOutline, 'FieldModelConfigOutline')),
    collectClassDefaults(getClassOrThrow(fieldModelModel, 'FieldModelConfig'))
  );
  const availableLayoutClasses = readStringLiteralUnion(
    getSourceFileOrThrow(project, 'packages/sails-ng-common/src/config/dictionary.outline.ts'),
    'AvailableFieldLayoutDefinitionOutlines'
  );

  return {
    sharedFormProperties,
    sharedComponentConfigProperties,
    sharedModelConfigProperties,
    availableLayoutClasses,
  };
}

function collectAvailableTopLevelComponentClasses(project: Project): string[] {
  const internalComponentClasses = new Set(['TabContentComponent', 'ReusableComponent', 'AccordionPanelComponent']);

  return collectFormComponentDefinitionRecords(project)
    .map(record => record.componentClass)
    .filter(componentClass => !internalComponentClasses.has(componentClass));
}

function collectFormComponentDefinitionRecords(project: Project): FormComponentDefinitionRecord[] {
  const dictionaryModel = getSourceFileOrThrow(project, 'packages/sails-ng-common/src/config/dictionary.model.ts');
  const allDefsDeclaration = getVariableDeclarationOrThrow(dictionaryModel, 'AllDefs');
  const initializer = unwrapArrayLiteralExpression(allDefsDeclaration.getInitializerOrThrow());
  const records: FormComponentDefinitionRecord[] = [];

  for (const element of initializer.getElements()) {
    if (!Node.isSpreadElement(element)) {
      continue;
    }
    const expression = element.getExpression();
    if (!Node.isIdentifier(expression)) {
      continue;
    }

    const declaration = getVariableDeclarationFromExpression(expression);
    if (!declaration) {
      continue;
    }

    const initializerNode = declaration.getInitializer();
    if (!initializerNode || !Node.isExpression(initializerNode)) {
      continue;
    }
    const mapInitializer = unwrapArrayLiteralExpression(initializerNode);
    if (!mapInitializer) {
      continue;
    }

    for (const formComponentEntry of mapInitializer.getElements().filter(candidate => isFormComponentDefinitionEntry(candidate))) {
      if (!Node.isObjectLiteralExpression(formComponentEntry)) {
        continue;
      }

      const className = resolveStringLiteralFromProperty(formComponentEntry, 'class');
      const definitionClassName = resolveIdentifierPropertyText(formComponentEntry, 'def');
      if (!className || !definitionClassName) {
        continue;
      }

      records.push({
        componentClass: className,
        definitionClassName,
        sourceFile: declaration.getSourceFile(),
      });
    }
  }

  return records;
}

function unwrapArrayLiteralExpression(expression: Expression): ArrayLiteralExpression {
  let current: Expression = expression;

  while (
    Node.isAsExpression(current) ||
    Node.isParenthesizedExpression(current) ||
    Node.isSatisfiesExpression(current)
  ) {
    current = current.getExpression();
  }

  if (!Node.isArrayLiteralExpression(current)) {
    throw new Error(`Expected array literal expression, found ${current.getKindName()}`);
  }

  return current;
}

function buildFormComponentDocEntry(
  project: Project,
  record: FormComponentDefinitionRecord,
  metadata: DocsMetadata,
  availableFormComponentClasses: string[]
): FormComponentDocEntry | null {
  const outlineFile = getCompanionOutlineFile(project, record.sourceFile);
  const definitionInterface = getInterfaceOrThrow(
    outlineFile,
    record.definitionClassName.replace(/Definition$/, 'DefinitionOutline')
  );
  const componentProperty = getPropertyOrThrow(definitionInterface, 'component');
  const modelProperty = definitionInterface.getProperty('model');
  const layoutProperty = definitionInterface.getProperty('layout');

  const componentDefinitionInterface = getInterfaceFromPropertyType(componentProperty);
  const modelDefinitionInterface =
    modelProperty && modelProperty.getTypeNode()?.getText().replace(/[\s?]/g, '') !== 'never'
      ? getInterfaceFromPropertyType(modelProperty)
      : undefined;

  const componentConfigType = getConfigTypeName(componentDefinitionInterface);
  const modelConfigType = modelDefinitionInterface ? getConfigTypeName(modelDefinitionInterface) : undefined;
  const componentConfigInterface = componentConfigType
    ? getInterfaceIfExists(outlineFile, componentConfigType)
    : undefined;
  const modelConfigInterface = modelConfigType ? getInterfaceIfExists(outlineFile, modelConfigType) : undefined;

  const componentDefaults = componentConfigType
    ? collectConfigDefaults(record.sourceFile, componentConfigType.replace(/Outline$/, ''))
    : new Map<string, string>();
  const modelDefaults = modelConfigType
    ? collectConfigDefaults(record.sourceFile, modelConfigType.replace(/Outline$/, ''))
    : new Map<string, string>();

  const sharedComponentNames = new Set(metadata.sharedComponentConfigProperties.map(property => property.name));
  const sharedModelNames = new Set(metadata.sharedModelConfigProperties.map(property => property.name));

  const componentConfigProperties = componentConfigInterface
    ? applyDefaultsToDocProperties(
        collectInterfaceProperties(componentConfigInterface).filter(property => !sharedComponentNames.has(property.name)),
        componentDefaults
      )
    : [];

  const modelConfigProperties = modelConfigInterface
    ? applyDefaultsToDocProperties(
        collectInterfaceProperties(modelConfigInterface).filter(property => !sharedModelNames.has(property.name)),
        modelDefaults
      )
    : [];

  const modelClass = modelDefinitionInterface ? extractClassNamesFromType(modelProperty!.getTypeNodeOrThrow().getType())[0] : undefined;
  const valueType = modelDefinitionInterface ? extractModelValueType(modelDefinitionInterface) : undefined;
  const layoutClasses = layoutProperty ? extractClassNamesFromType(layoutProperty.getTypeNodeOrThrow().getType()) : [];
  const availability =
    record.componentClass === REUSABLE_COMPONENT_NAME || !availableFormComponentClasses.includes(record.componentClass)
      ? 'nested/internal'
      : 'top-level';

  const defaults: Record<string, unknown> = {};
  for (const property of [...componentConfigProperties, ...modelConfigProperties]) {
    if (property.defaultValue != null) {
      defaults[property.name] = property.defaultValue;
    }
  }

  return {
    componentClass: record.componentClass,
    modelClass,
    layoutClasses,
    availability,
    componentConfigType,
    modelConfigType,
    valueType,
    defaults,
    componentConfigProperties,
    modelConfigProperties,
    sharedProperties: metadata.sharedFormProperties,
    example: renderExampleBlock({
      componentClass: record.componentClass,
      modelClass,
      valueType,
      componentConfigProperties,
    }),
  };
}

function resolveRepoRoot(explicitRoot?: string): string {
  const startDir = path.resolve(explicitRoot ?? process.cwd());
  let current = startDir;

  while (true) {
    if (fs.existsSync(path.join(current, 'packages', 'sails-ng-common', 'tsconfig.prod.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error(`Unable to resolve ReDBox repo root from ${startDir}`);
}

function getSourceFileOrThrow(project: Project, relativePath: string): SourceFile {
  const normalizedSuffix = relativePath.split(path.sep).join('/');
  const sourceFile = project.getSourceFiles().find(candidate => candidate.getFilePath().split(path.sep).join('/').endsWith(normalizedSuffix));
  if (!sourceFile) {
    throw new Error(`Unable to load source file: ${relativePath}`);
  }
  return sourceFile;
}

function getVariableDeclarationOrThrow(sourceFile: SourceFile, name: string): VariableDeclaration {
  const declaration = sourceFile.getVariableDeclaration(name);
  if (!declaration) {
    throw new Error(`Unable to find variable '${name}' in ${sourceFile.getBaseName()}`);
  }
  return declaration;
}

function getInterfaceOrThrow(sourceFile: SourceFile, name: string): InterfaceDeclaration {
  const declaration = sourceFile.getInterface(name);
  if (!declaration) {
    throw new Error(`Unable to find interface '${name}' in ${sourceFile.getBaseName()}`);
  }
  return declaration;
}

function getInterfaceIfExists(sourceFile: SourceFile, name: string): InterfaceDeclaration | undefined {
  return sourceFile.getInterface(name);
}

function getClassOrThrow(sourceFile: SourceFile, name: string): ClassDeclaration {
  const declaration = sourceFile.getClass(name);
  if (!declaration) {
    throw new Error(`Unable to find class '${name}' in ${sourceFile.getBaseName()}`);
  }
  return declaration;
}

function getPropertyOrThrow(interfaceDeclaration: InterfaceDeclaration, name: string): PropertySignature {
  const property = interfaceDeclaration.getProperty(name);
  if (!property) {
    throw new Error(`Unable to find property '${name}' in ${interfaceDeclaration.getName()}`);
  }
  return property;
}

function getCompanionOutlineFile(project: Project, modelSourceFile: SourceFile): SourceFile {
  const outlinePath = modelSourceFile.getFilePath().replace(/\.model\.ts$/, '.outline.ts');
  const sourceFile = project.getSourceFile(outlinePath);
  if (!sourceFile) {
    throw new Error(`Unable to find outline source for ${modelSourceFile.getBaseName()}`);
  }
  return sourceFile;
}

function isFormComponentDefinitionEntry(node: Node): boolean {
  if (!Node.isObjectLiteralExpression(node)) {
    return false;
  }
  const property = node.getProperty('kind');
  if (!property || !Node.isPropertyAssignment(property)) {
    return false;
  }
  const initializer = property.getInitializerOrThrow();
  return Node.isIdentifier(initializer)
    ? initializer.getText() === FORM_COMPONENT_DEFINITION_KIND
    : resolveStringLiteral(initializer) === FORM_COMPONENT_DEFINITION_KIND;
}

function getVariableDeclarationFromExpression(expression: Expression): VariableDeclaration | undefined {
  const symbol = expression.getSymbol() ?? expression.getType().getSymbol();
  const resolvedSymbol = symbol?.getAliasedSymbol?.() ?? symbol;
  const declaration = resolvedSymbol?.getDeclarations().find(Node.isVariableDeclaration);
  return declaration;
}

function resolveStringLiteralFromProperty(objectLiteral: ObjectLiteralExpression, propertyName: string): string | undefined {
  const property = objectLiteral.getProperty(propertyName);
  if (!property || !Node.isPropertyAssignment(property)) {
    return undefined;
  }
  return resolveStringLiteral(property.getInitializerOrThrow());
}

function resolveIdentifierPropertyText(objectLiteral: ObjectLiteralExpression, propertyName: string): string | undefined {
  const property = objectLiteral.getProperty(propertyName);
  if (!property || !Node.isPropertyAssignment(property)) {
    return undefined;
  }
  const initializer = property.getInitializerOrThrow();
  return Node.isIdentifier(initializer) ? initializer.getText() : undefined;
}

function resolveStringLiteral(expression: Expression): string | undefined {
  while (
    Node.isAsExpression(expression) ||
    Node.isParenthesizedExpression(expression) ||
    Node.isSatisfiesExpression(expression)
  ) {
    expression = expression.getExpression();
  }

  if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.getLiteralText();
  }
  if (Node.isIdentifier(expression)) {
    const declaration = getVariableDeclarationFromExpression(expression);
    const initializer = declaration?.getInitializer();
    return initializer && Node.isExpression(initializer) ? resolveStringLiteral(initializer) : expression.getText();
  }
  return undefined;
}

function readStringLiteralUnion(sourceFile: SourceFile, aliasName: string): string[] {
  const alias = sourceFile.getTypeAliasOrThrow(aliasName);
  return dedupeStrings(extractClassNamesFromType(alias.getTypeNodeOrThrow().getType(), alias));
}

function extractClassNamesFromType(type: Type, locationNode?: Node): string[] {
  if (type.isNever()) {
    return [];
  }
  if (type.isUnion()) {
    return dedupeStrings(type.getUnionTypes().flatMap(member => extractClassNamesFromType(member, locationNode)));
  }
  if (type.isStringLiteral()) {
    const literalValue = type.getLiteralValue();
    return typeof literalValue === 'string' ? [literalValue] : [];
  }

  const classProperty = type.getProperty('class');
  if (classProperty) {
    const declaration = classProperty.getDeclarations()[0] ?? locationNode;
    return declaration ? extractClassNamesFromType(classProperty.getTypeAtLocation(declaration), declaration) : [];
  }

  const aliasSymbol = type.getAliasSymbol();
  if (aliasSymbol) {
    const aliasDeclaration = aliasSymbol.getDeclarations()[0];
    if (aliasDeclaration && Node.isTypeAliasDeclaration(aliasDeclaration)) {
      return extractClassNamesFromType(aliasDeclaration.getTypeNodeOrThrow().getType(), aliasDeclaration);
    }
  }

  return [];
}

function collectInterfaceProperties(interfaceDeclaration: InterfaceDeclaration, visited = new Set<string>()): InternalDocProperty[] {
  const interfaceName = interfaceDeclaration.getName();
  if (!interfaceName || visited.has(interfaceName)) {
    return [];
  }
  visited.add(interfaceName);

  const properties = interfaceDeclaration.getProperties().map(property => toInternalDocProperty(property, interfaceName));
  const inherited = interfaceDeclaration.getExtends().flatMap(heritage => {
    const symbol = heritage.getExpression().getSymbol();
    const declaration = symbol?.getDeclarations().find(Node.isInterfaceDeclaration);
    return declaration ? collectInterfaceProperties(declaration, visited) : [];
  });

  return dedupeInternalDocProperties([...properties, ...inherited]);
}

function toInternalDocProperty(property: PropertySignature, sourceInterface: string): InternalDocProperty {
  const description = property
    .getJsDocs()
    .map(doc => doc.getComment())
    .filter((comment): comment is string => typeof comment === 'string' && comment.trim().length > 0)
    .join(' ')
    .trim();

  return {
    name: property.getName(),
    type: property.getTypeNode()?.getText() ?? property.getType().getText(property),
    required: !property.hasQuestionToken(),
    description: description || undefined,
    sourceInterface,
  };
}

function dedupeInternalDocProperties(properties: InternalDocProperty[]): InternalDocProperty[] {
  const seen = new Set<string>();
  const deduped: InternalDocProperty[] = [];

  for (const property of properties) {
    if (seen.has(property.name)) {
      continue;
    }
    seen.add(property.name);
    deduped.push(property);
  }

  return deduped;
}

function toPublicDocProperties(properties: InternalDocProperty[]): DocProperty[] {
  return properties.map(({ sourceInterface: _sourceInterface, ...property }) => property);
}

function applyDefaultsToDocProperties(properties: InternalDocProperty[], defaults: Map<string, string>): DocProperty[] {
  return properties.map(({ sourceInterface: _sourceInterface, ...property }) => ({
    ...property,
    defaultValue: defaults.get(property.name) ?? property.defaultValue,
  }));
}

function dedupeDocProperties(properties: DocProperty[]): DocProperty[] {
  const seen = new Set<string>();
  const deduped: DocProperty[] = [];

  for (const property of properties) {
    if (seen.has(property.name)) {
      continue;
    }
    seen.add(property.name);
    deduped.push(property);
  }

  return deduped;
}

function collectConfigDefaults(modelSourceFile: SourceFile, configClassName: string): Map<string, string> {
  const classDeclaration = modelSourceFile.getClass(configClassName);
  return classDeclaration ? collectClassDefaults(classDeclaration) : new Map<string, string>();
}

function collectClassDefaults(classDeclaration: ClassDeclaration, visited = new Set<string>()): Map<string, string> {
  const className = classDeclaration.getName();
  if (!className || visited.has(className)) {
    return new Map<string, string>();
  }
  visited.add(className);

  const defaults = classDeclaration.getBaseClass()
    ? collectClassDefaults(classDeclaration.getBaseClass()!, visited)
    : new Map<string, string>();

  for (const property of classDeclaration.getProperties()) {
    if (property.isStatic()) {
      continue;
    }
    const initializer = property.getInitializer();
    if (!initializer) {
      continue;
    }
    defaults.set(property.getName(), initializer.getText());
  }

  return defaults;
}

function getInterfaceFromPropertyType(property: PropertySignature): InterfaceDeclaration {
  const typeNode = property.getTypeNodeOrThrow();
  const typeName = typeNode.getText().replace(/[\s?]/g, '');
  if (typeName === 'never') {
    throw new Error(`Property '${property.getName()}' has no interface because it is typed as never`);
  }
  const baseTypeName = typeName.replace(/\[\]$/g, '');
  const sourceFile = property.getSourceFile();
  const declaration = sourceFile.getInterface(baseTypeName);
  if (!declaration) {
    throw new Error(`Unable to resolve interface '${baseTypeName}' from ${sourceFile.getBaseName()}`);
  }
  return declaration;
}

function getConfigTypeName(definitionInterface: InterfaceDeclaration): string | undefined {
  const configProperty = definitionInterface.getProperty('config');
  const typeNode = configProperty?.getTypeNode();
  if (!typeNode) {
    return undefined;
  }

  const typeText = typeNode.getText().replace(/^\(|\)$/g, '').trim();
  if (typeText === 'never') {
    return undefined;
  }
  return typeText;
}

function extractModelValueType(modelDefinitionInterface: InterfaceDeclaration): string | undefined {
  for (const heritage of modelDefinitionInterface.getExtends()) {
    const expressionText = heritage.getExpression().getText();
    if (!expressionText.startsWith('FieldModelDefinition')) {
      continue;
    }
    const typeArgument = heritage.getTypeArguments()[0];
    if (typeArgument) {
      const resolvedType = typeArgument.getType();
      const aliasSymbol = resolvedType.getAliasSymbol();
      const aliasDeclaration = aliasSymbol?.getDeclarations()[0];
      if (aliasDeclaration && Node.isTypeAliasDeclaration(aliasDeclaration)) {
        return aliasDeclaration.getTypeNodeOrThrow().getText();
      }
      return resolvedType.getText(typeArgument);
    }
  }
  return undefined;
}

function renderPropertyTable(properties: DocProperty[]): string {
  const lines = ['| Property | Type | Required | Default | Description |', '| --- | --- | --- | --- | --- |'];
  for (const property of properties) {
    lines.push(
      `| ${escapeMarkdownTable(property.name)} | ${escapeMarkdownTable(property.type)} | ${property.required ? 'Yes' : 'No'} | ${escapeMarkdownTable(property.defaultValue ?? '')} | ${escapeMarkdownTable(property.description ?? '')} |`
    );
  }
  return lines.join('\n');
}

function renderLayoutSummary(layoutClasses: string[], availableLayoutClasses: string[]): string {
  if (layoutClasses.length === 0) {
    return 'none';
  }
  if (
    availableLayoutClasses.length > 0 &&
    layoutClasses.length === availableLayoutClasses.length &&
    layoutClasses.every(layoutClass => availableLayoutClasses.includes(layoutClass))
  ) {
    return 'any available field layout';
  }
  return layoutClasses.join(', ');
}

function renderExampleBlock(options: {
  componentClass: string;
  modelClass?: string;
  valueType?: string;
  componentConfigProperties: DocProperty[];
}): string {
  const lines = ['{', `  name: '${inferExampleName(options.componentClass)}',`, '  component: {', `    class: '${options.componentClass}',`];

  const componentConfig = buildExampleConfig(options.componentConfigProperties);
  if (componentConfig) {
    lines.push('    config: ' + renderExampleValue(componentConfig, 2) + ',');
  }
  lines.push('  },');

  if (options.modelClass) {
    lines.push('  model: {');
    lines.push(`    class: '${options.modelClass}',`);
    const defaultValue = inferDefaultValueForValueType(options.valueType);
    if (defaultValue !== undefined) {
      lines.push('    config: ' + renderExampleValue({ defaultValue }, 2) + ',');
    }
    lines.push('  },');
  }

  if (lines[lines.length - 1]?.endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  lines.push('}');
  return lines.join('\n');
}

function buildExampleConfig(properties: DocProperty[]): Record<string, unknown> | undefined {
  const config: Record<string, unknown> = {};

  for (const property of properties) {
    const value = inferExampleValueForType(property.type, property.defaultValue);
    if (value === undefined) {
      continue;
    }
    config[property.name] = value;
    if (!property.required && Object.keys(config).length >= 2) {
      break;
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function inferExampleName(componentClass: string): string {
  return componentClass.replace(/Component$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function inferDefaultValueForValueType(valueType?: string): unknown {
  if (!valueType) {
    return undefined;
  }
  const normalized = valueType.replace(/\s+/g, '');
  if (normalized.endsWith('[]')) {
    return [];
  }
  if (normalized === 'string') {
    return '';
  }
  if (normalized === 'number') {
    return 0;
  }
  if (normalized === 'boolean') {
    return false;
  }
  return undefined;
}

function inferExampleValueForType(typeText: string, defaultValue?: string): unknown {
  if (defaultValue != null) {
    return parseDefaultValue(defaultValue);
  }

  const normalized = typeText.replace(/\s+/g, '');
  const literalMatch = typeText.match(/"([^"]+)"|'([^']+)'/);
  if (literalMatch) {
    return literalMatch[1] ?? literalMatch[2] ?? '';
  }
  if (normalized === 'string') {
    return 'example';
  }
  if (normalized === 'number') {
    return 0;
  }
  if (normalized === 'boolean') {
    return false;
  }
  if (normalized.endsWith('[]')) {
    if (normalized.includes('AvailableFormComponentDefinition')) {
      return [minimalNestedFormComponent()];
    }
    return [];
  }
  if (normalized.includes('AvailableFormComponentDefinition')) {
    return minimalNestedFormComponent();
  }
  if (normalized.startsWith('Record<')) {
    return {};
  }
  return undefined;
}

function minimalNestedFormComponent(): Record<string, unknown> {
  return {
    name: 'nested-item',
    component: {
      class: 'SimpleInputComponent',
    },
    model: {
      class: 'SimpleInputModel',
    },
  };
}

function parseDefaultValue(defaultValue: string): unknown {
  const normalized = defaultValue.trim();
  if (normalized === "''" || normalized === '""') {
    return '';
  }
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  if (normalized === '[]') {
    return [];
  }
  if (normalized === '{}') {
    return {};
  }
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }
  const stringMatch = normalized.match(/^['"](.*)['"]$/s);
  if (stringMatch) {
    return stringMatch[1];
  }
  return normalized;
}

function renderExampleValue(value: unknown, indentLevel: number): string {
  const indent = '  '.repeat(indentLevel);
  const childIndent = '  '.repeat(indentLevel + 1);

  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return `[\n${value.map(entry => `${childIndent}${renderExampleValue(entry, indentLevel + 1)}`).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }
    return `{\n${entries
      .map(([key, entry]) => `${childIndent}${formatExampleKey(key)}: ${renderExampleValue(entry, indentLevel + 1)}`)
      .join(',\n')}\n${indent}}`;
  }
  return 'undefined';
}

function formatExampleKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}
