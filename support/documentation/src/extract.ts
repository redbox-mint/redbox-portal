import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  DocumentationDiagnostic,
  Lifecycle,
  MemberContract,
  RouteContract,
  SurfaceContract,
  SurfaceKind,
} from './catalogue';
import { parseDocumentation } from './lifecycle';
import { repositoryRoot, sourceFile, sourceLocation } from './source';

interface ExtractionResult {
  surfaces: SurfaceContract[];
  diagnostics: DocumentationDiagnostic[];
}

function nodeName(node: ts.Node): string | undefined {
  if ('name' in node && node.name && ts.isIdentifier(node.name as ts.Node)) return (node.name as ts.Identifier).text;
  return undefined;
}

function descendants<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function namedDeclaration(file: ts.SourceFile, name: string): ts.Declaration | undefined {
  return descendants(
    file,
    (node): node is ts.Declaration =>
      (ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isFunctionDeclaration(node)) &&
      nodeName(node) === name
  )[0];
}

function parameterContracts(checker: ts.TypeChecker, method: ts.MethodDeclaration): MemberContract['parameters'] {
  return method.parameters.map(parameter => {
    const symbol = checker.getSymbolAtLocation(parameter.name);
    return {
      name: parameter.name.getText(),
      type: checker.typeToString(checker.getTypeAtLocation(parameter)),
      description: symbol ? ts.displayPartsToString(symbol.getDocumentationComment(checker)) || undefined : undefined,
    };
  });
}

function methodContract(
  checker: ts.TypeChecker,
  containerId: string,
  method: ts.MethodDeclaration,
  inherited: Lifecycle
): MemberContract {
  const docs = parseDocumentation(method, inherited);
  const signature = checker.getSignatureFromDeclaration(method);
  const returnTag = ts.getJSDocReturnTag(method);
  return {
    id: `${containerId}.${nodeName(method)}`,
    name: nodeName(method) ?? 'unknown',
    lifecycle: docs.lifecycle,
    signature: normalizeType(
      signature ? checker.signatureToString(signature, method, ts.TypeFormatFlags.NoTruncation) : method.getText()
    ),
    description: docs.summary || undefined,
    parameters: parameterContracts(checker, method),
    returns: returnTag?.comment ? String(returnTag.comment) : undefined,
    source: sourceLocation(method),
  };
}

function normalizeType(value: string): string {
  const root = repositoryRoot.replaceAll('\\', '/');
  return value
    .replaceAll('\\', '/')
    .replaceAll(root, '')
    .replace(/import\("\/packages\/[^"/]+\/node_modules\/([^"/]+(?:\/[^"/]+)?)\/[^"?]*"\)/g, 'import("$1")')
    .replace(/import\("\/node_modules\/([^"?]+)"\)/g, 'import("$1")')
    .replace(/import\("\/packages\//g, 'import("packages/');
}

function surfaceFromClass(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration,
  id: string,
  name: string,
  kind: SurfaceKind,
  routes?: RouteContract[]
): SurfaceContract {
  const docs = parseDocumentation(declaration);
  const methods = declaration.members.filter(
    (member): member is ts.MethodDeclaration => ts.isMethodDeclaration(member) && Boolean(nodeName(member))
  );
  const selected =
    kind === 'base-service' || kind === 'base-controller'
      ? methods.filter(method =>
          ['exports', 'init', 'sendResp', 'getObservable', 'convertToType'].includes(nodeName(method) ?? '')
        )
      : methods.filter(
          method =>
            !ts
              .getModifiers(method)
              ?.some(
                modifier =>
                  modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword
              )
        );
  return {
    id,
    name,
    kind,
    lifecycle: docs.lifecycle,
    documentation: {
      summary: docs.summary,
      extensionSemantics: docs.extensionSemantics,
      caveats: docs.caveats,
      see: docs.see,
    },
    source: sourceLocation(declaration),
    members: selected.map(method => methodContract(checker, id, method, docs.lifecycle)),
    routes,
  };
}

function constantValue(file: ts.SourceFile, constantName: string): string | undefined {
  const declaration = descendants(
    file,
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === constantName
  )[0];
  const initializer = declaration?.initializer;
  if (!initializer) return undefined;
  if (ts.isAsExpression(initializer) && ts.isStringLiteral(initializer.expression)) return initializer.expression.text;
  if (ts.isAsExpression(initializer) && ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isNoSubstitutionTemplateLiteral(initializer)) return initializer.text;
  return undefined;
}

function defaultValues(file: ts.SourceFile, className: string): Map<string, string> {
  const result = new Map<string, string>();
  const declaration = namedDeclaration(file, className);
  if (!declaration || !ts.isClassDeclaration(declaration)) return result;
  for (const member of declaration.members) {
    if (ts.isPropertyDeclaration(member) && nodeName(member) && member.initializer) {
      result.set(nodeName(member)!, member.initializer.getText());
    }
  }
  return result;
}

function formPropertyContracts(
  checker: ts.TypeChecker,
  declaration: ts.InterfaceDeclaration,
  containerId: string,
  inherited: Lifecycle,
  defaults: Map<string, string>
): MemberContract[] {
  const type = checker.getTypeAtLocation(declaration);
  return checker.getPropertiesOfType(type).map(property => {
    const member = property.valueDeclaration ?? property.declarations?.[0] ?? declaration;
    const docs = parseDocumentation(member, inherited);
    return {
      id: `${containerId}.${property.name}`,
      name: property.name,
      lifecycle: docs.lifecycle,
      type: normalizeType(
        checker.typeToString(
          checker.getTypeOfSymbolAtLocation(property, member),
          member,
          ts.TypeFormatFlags.NoTruncation
        )
      ),
      defaultValue: defaults.get(property.name),
      optional: Boolean(property.flags & ts.SymbolFlags.Optional),
      description: ts.displayPartsToString(property.getDocumentationComment(checker)) || docs.summary || undefined,
      source: sourceLocation(member),
    };
  });
}

function angularMappings(): { components: Map<string, string>; models: Map<string, string> } {
  const text = fs.readFileSync(
    path.join(repositoryRoot, 'angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts'),
    'utf8'
  );
  const components = new Map<string, string>();
  const models = new Map<string, string>();
  for (const match of text.matchAll(/\[([A-Za-z0-9]+ComponentName)\]:\s*([A-Za-z0-9]+)/g))
    components.set(match[1], match[2]);
  for (const match of text.matchAll(/\[([A-Za-z0-9]+ModelName)\]:\s*([A-Za-z0-9]+)/g)) models.set(match[1], match[2]);
  return { components, models };
}

function extractForms(program: ts.Program, checker: ts.TypeChecker): SurfaceContract[] {
  const forms: SurfaceContract[] = [];
  const formFile = sourceFile(program, 'packages/sails-ng-common/src/config/form-config.outline.ts');
  const formModelFile = sourceFile(program, 'packages/sails-ng-common/src/config/form-config.model.ts');
  const formDeclaration = namedDeclaration(formFile, 'FormConfigFrame');
  if (formDeclaration && ts.isInterfaceDeclaration(formDeclaration)) {
    const docs = parseDocumentation(formDeclaration);
    forms.push({
      id: 'form-config:FormConfig',
      kind: 'form-config',
      name: 'FormConfig',
      lifecycle: docs.lifecycle,
      documentation: {
        summary: docs.summary,
        extensionSemantics: docs.extensionSemantics,
        caveats: docs.caveats,
        see: docs.see,
      },
      source: sourceLocation(formDeclaration),
      members: formPropertyContracts(
        checker,
        formDeclaration,
        'form-config:FormConfig',
        docs.lifecycle,
        defaultValues(formModelFile, 'FormConfig')
      ),
    });
  }

  const dictionaryOutline = sourceFile(program, 'packages/sails-ng-common/src/config/dictionary.outline.ts').getText();
  const dictionaryModel = sourceFile(program, 'packages/sails-ng-common/src/config/dictionary.model.ts').getText();
  const visitors = sourceFile(program, 'packages/sails-ng-common/src/config/visitor/base.outline.ts').getText();
  const angular = angularMappings();
  const componentDirectory = path.join(repositoryRoot, 'packages/sails-ng-common/src/config/component');
  const outlineFiles = fs
    .readdirSync(componentDirectory)
    .filter(name => name.endsWith('.outline.ts'))
    .sort();
  for (const filename of outlineFiles) {
    const relativePath = `packages/sails-ng-common/src/config/component/${filename}`;
    const file = sourceFile(program, relativePath);
    const contractPrefix = filename
      .replace('.outline.ts', '')
      .split('-')
      .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join('');
    const registeredType = descendants(
      file,
      (node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text.endsWith('Types')
    )[0];
    const registryPrefix = registeredType?.name.text.slice(0, -'Types'.length) ?? contractPrefix;
    const componentConstants = descendants(
      file,
      (node): node is ts.VariableDeclaration =>
        ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text.endsWith('ComponentName')
    );
    for (const constant of componentConstants) {
      const constantName = (constant.name as ts.Identifier).text;
      const prefix = constantName.slice(0, -'ComponentName'.length);
      const name = constantValue(file, constantName);
      const declaration =
        namedDeclaration(file, `${prefix}FormComponentDefinitionOutline`) ??
        namedDeclaration(file, `${prefix.replace(/Field$/, '')}FormComponentDefinitionOutline`);
      if (!name || !declaration || !ts.isInterfaceDeclaration(declaration)) continue;
      const declarationPrefix = nodeName(declaration)?.replace(/FormComponentDefinitionOutline$/, '') ?? prefix;
      const docs = parseDocumentation(declaration);
      const modelPath = relativePath.replace('.outline.ts', '.model.ts');
      const modelFile = fs.existsSync(path.join(repositoryRoot, modelPath))
        ? sourceFile(program, modelPath)
        : undefined;
      const configDeclaration = namedDeclaration(file, `${declarationPrefix}FieldComponentConfigOutline`);
      const modelConstantName = `${declarationPrefix}ModelName`;
      const visitorMethods = [...visitors.matchAll(new RegExp(`visit${declarationPrefix}[A-Za-z0-9]+`, 'g'))]
        .map(match => match[0])
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort();
      const id = `form-component:${name}`;
      forms.push({
        id,
        kind: 'form-component',
        name,
        lifecycle: docs.lifecycle,
        documentation: {
          summary: docs.summary,
          extensionSemantics: docs.extensionSemantics,
          caveats: docs.caveats,
          see: docs.see,
        },
        source: sourceLocation(declaration),
        members:
          configDeclaration && ts.isInterfaceDeclaration(configDeclaration)
            ? formPropertyContracts(
                checker,
                configDeclaration,
                id,
                docs.lifecycle,
                modelFile ? defaultValues(modelFile, `${declarationPrefix}FieldComponentConfig`) : new Map()
              )
            : [],
        relationships: {
          definitionMapping:
            modelFile && dictionaryModel.includes(`${registryPrefix}Defaults`)
              ? `${registryPrefix}Defaults`
              : undefined,
          visitorMethods,
          angularComponent: angular.components.get(constantName),
          angularModel: angular.models.get(modelConstantName),
        },
      });

      const checks = [
        dictionaryOutline.includes(`${registryPrefix}Types`),
        dictionaryModel.includes(`${registryPrefix}Map`),
        dictionaryModel.includes(`${registryPrefix}Defaults`) || !modelFile,
        visitorMethods.length > 0,
        angular.components.has(constantName) || declarationPrefix === 'Reusable',
      ];
      (forms.at(-1) as SurfaceContract & { consistency?: boolean[] }).consistency = checks;
    }
  }
  return forms;
}

function basicSurface(
  checker: ts.TypeChecker,
  program: ts.Program,
  relativePath: string,
  declarationName: string,
  id: string,
  kind: SurfaceKind,
  displayName = declarationName
): SurfaceContract | undefined {
  const declaration = namedDeclaration(sourceFile(program, relativePath), declarationName);
  if (!declaration) return undefined;
  if (ts.isClassDeclaration(declaration)) return surfaceFromClass(checker, declaration, id, displayName, kind);
  const docs = parseDocumentation(declaration);
  const members: MemberContract[] = [];
  if (
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isTypeLiteralNode(declaration)
  ) {
    const type = checker.getTypeAtLocation(declaration);
    for (const property of checker.getPropertiesOfType(type)) {
      const member = property.valueDeclaration ?? property.declarations?.[0] ?? declaration;
      members.push({
        id: `${id}.${property.name}`,
        name: property.name,
        lifecycle: docs.lifecycle,
        type: normalizeType(checker.typeToString(checker.getTypeOfSymbolAtLocation(property, member))),
        optional: Boolean(property.flags & ts.SymbolFlags.Optional),
        description: ts.displayPartsToString(property.getDocumentationComment(checker)) || undefined,
        source: sourceLocation(member),
      });
    }
  }
  return {
    id,
    kind,
    name: displayName,
    lifecycle: docs.lifecycle,
    documentation: {
      summary: docs.summary,
      extensionSemantics: docs.extensionSemantics,
      caveats: docs.caveats,
      see: docs.see,
    },
    source: sourceLocation(declaration),
    members,
  };
}

function diagnosticsFor(surfaces: SurfaceContract[]): DocumentationDiagnostic[] {
  const findings: DocumentationDiagnostic[] = [];
  for (const surface of surfaces) {
    if (surface.lifecycle === 'unclassified') {
      findings.push({
        code: 'unclassified',
        severity: 'advisory',
        surfaceId: surface.id,
        message: `${surface.name} is registered but has no lifecycle classification.`,
        source: surface.source,
      });
    }
    if (surface.lifecycle === 'internal') continue;
    if (surface.lifecycle !== 'unclassified' && !surface.documentation.summary)
      findings.push({
        code: 'missing-summary',
        severity: 'advisory',
        surfaceId: surface.id,
        message: `${surface.name} has no summary.`,
        source: surface.source,
      });
    if (surface.lifecycle !== 'unclassified' && !surface.documentation.extensionSemantics)
      findings.push({
        code: 'missing-extension-semantics',
        severity: 'advisory',
        surfaceId: surface.id,
        message: `${surface.name} does not explain its extension or override semantics.`,
        source: surface.source,
      });
    for (const member of surface.lifecycle === 'unclassified' ? [] : surface.members) {
      if (!member.description)
        findings.push({
          code: 'undocumented-member',
          severity: 'advisory',
          surfaceId: surface.id,
          message: `${surface.name}.${member.name} is not documented.`,
          source: member.source,
        });
      for (const parameter of member.parameters ?? []) {
        if (!parameter.description)
          findings.push({
            code: 'missing-parameter-description',
            severity: 'advisory',
            surfaceId: surface.id,
            message: `${surface.name}.${member.name} parameter ${parameter.name} is not documented.`,
            source: member.source,
          });
      }
      const returnType = member.signature?.match(/\):\s*(.+)$/)?.[1];
      if (
        returnType &&
        !member.returns &&
        !/^(?:void|never|Promise<void>)(?:\s*\|\s*(?:void|never|Promise<void>))*$/.test(returnType)
      ) {
        findings.push({
          code: 'missing-return-description',
          severity: 'advisory',
          surfaceId: surface.id,
          message: `${surface.name}.${member.name} has a non-void return contract without a return description.`,
          source: member.source,
        });
      }
    }
    if (surface.kind === 'form-component') {
      const checks = (surface as SurfaceContract & { consistency?: boolean[] }).consistency ?? [];
      if (checks.some(value => !value))
        findings.push({
          code: 'form-contract-mismatch',
          severity: 'advisory',
          surfaceId: surface.id,
          message: `${surface.name} is not consistently wired through types, definitions, defaults, visitors, and Angular dictionaries.`,
          source: surface.source,
        });
    }
  }
  return findings;
}

export function extractCatalogue(program: ts.Program): ExtractionResult {
  const checker = program.getTypeChecker();
  const surfaces: SurfaceContract[] = [];
  // v6 publishes classified declarations, not removed singleton/shim registries.
  const contracts = [
    ['extensions/contract.ts', 'RedboxExtension', 'hook-protocol', 'hook-protocol:RedboxExtension'],
    ['extensions/contract.ts', 'ExtensionFactory', 'hook-protocol', 'hook-protocol:ExtensionFactory'],
    ['extensions/contract.ts', 'ExtensionRoute', 'hook-protocol', 'hook-protocol:ExtensionRoute'],
    ['extensions/contract.ts', 'ExtensionWork', 'hook-protocol', 'hook-protocol:ExtensionWork'],
    ['extensions/contract.ts', 'ExtensionHostIntegration', 'hook-protocol', 'hook-protocol:ExtensionHostIntegration'],
    ['application/Application.ts', 'ApplicationModule', 'hook-protocol', 'hook-protocol:ApplicationModule'],
    ['CoreService.ts', 'Service', 'base-service', 'base-service:Service'],
    ['records/Records.ts', 'Records', 'service', 'service:RecordsService'],
    ['forms/RecordValidation.ts', 'RecordValidation', 'service', 'service:RecordValidationService'],
  ] as const;
  for (const [file, name, kind, id] of contracts) {
    const surface = basicSurface(checker, program, `packages/redbox-core/src/${file}`, name, id, kind);
    if (surface) surfaces.push(surface);
  }
  surfaces.push(...extractForms(program, checker));
  surfaces.sort((left, right) => left.id.localeCompare(right.id));
  return { surfaces, diagnostics: diagnosticsFor(surfaces) };
}
