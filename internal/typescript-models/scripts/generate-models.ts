import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as ts from 'typescript';

import {
  AttributeOptions,
  EntityMeta,
  getRegisteredEntities,
  toWaterlineModelDef,
  WaterlineModelDefinition,
} from '../../sails-ts/lib/decorators';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'internal', 'typescript-models', 'src', 'models');
const API_MODELS_DIR = path.join(PROJECT_ROOT, 'api', 'models');
const TYPES_MODELS_DIR = path.join(
  PROJECT_ROOT,
  'packages',
  'redbox-core-types',
  'src',
  'models',
);
const SERVICES_DIR = path.join(PROJECT_ROOT, 'internal', 'sails-ts', 'api', 'services');
const TYPES_SERVICES_DIR = path.join(
  PROJECT_ROOT,
  'packages',
  'redbox-core-types',
  'src',
  'services',
  'generated',
);

async function discoverModelFiles(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverModelFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function loadModelModules(): Promise<Map<string, string>> {
  const files = await discoverModelFiles(MODELS_DIR);
  const fileMap = new Map<string, string>();
  if (!files.length) {
    console.warn(`No model files found in ${MODELS_DIR}`);
    return fileMap;
  }

  for (const file of files) {
    // The generator executes through ts-node which registers a require hook for TypeScript files.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(file);
    const className = path.basename(file, '.ts');
    fileMap.set(className, file);
  }
  return fileMap;
}

async function extractLocalTypes(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const typeDefinitions: string[] = [];
  let buffer: string[] = [];
  let inBlock = false;
  let braceCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (!inBlock) {
      if ((trimmed.startsWith('export interface') || trimmed.startsWith('export type')) && !trimmed.includes('Attributes extends Sails.WaterlineAttributes')) {
         inBlock = true;
         buffer.push(line);
         braceCount += (line.match(/{/g) || []).length;
         braceCount -= (line.match(/}/g) || []).length;
         
         if (braceCount === 0) {
             if (trimmed.includes(';') || trimmed.endsWith('}')) {
                 typeDefinitions.push(buffer.join('\n'));
                 buffer = [];
                 inBlock = false;
             }
         }
      }
    } else {
      buffer.push(line);
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      
      if (braceCount === 0) {
        typeDefinitions.push(buffer.join('\n'));
        buffer = [];
        inBlock = false;
      }
    }
  }
  
  return typeDefinitions.join('\n\n');
}

async function extractPropertyTypes(filePath: string): Promise<Record<string, string>> {
  const content = await fs.readFile(filePath, 'utf8');
  const typeMap: Record<string, string> = {};
  
  // Match public property definitions
  // public name?: type;
  // public name!: type;
  // public name: type;
  const regex = /public\s+(\w+)\s*(?:[?!])?\s*:\s*([^;]+);/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const propName = match[1];
    let typeDef = match[2].trim();
    // Remove any trailing comments if present (simple check)
    typeDef = typeDef.split('//')[0].trim();
    typeMap[propName] = typeDef;
  }
  
  return typeMap;
}

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function serializeValue(value: unknown, indent = 0): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `'${escapeString(value)}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`;
  }
  if (typeof value === 'function') {
    return indentLines(value.toString(), indent);
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return '[]';
    }
    const innerIndent = ' '.repeat(indent + 2);
    const closingIndent = ' '.repeat(indent);
    const serialized = value
      .map(item => `${innerIndent}${serializeValue(item, indent + 2)}`)
      .join(',\n');
    return `[\n${serialized}\n${closingIndent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) {
    return '{}';
  }
  const innerIndent = ' '.repeat(indent + 2);
  const closingIndent = ' '.repeat(indent);
  const serialized = entries
    .map(([key, entryValue]) => `${innerIndent}${key}: ${serializeValue(entryValue, indent + 2)}`)
    .join(',\n');
  return `{\n${serialized}\n${closingIndent}}`;
}

function indentLines(value: string, indentSize: number): string {
  const padding = ' '.repeat(indentSize);
  return value
    .split('\n')
    .map(line => `${padding}${line}`)
    .join('\n');
}

function buildModelModule(meta: EntityMeta, sourceRelativePath: string): string {
  const definition: WaterlineModelDefinition = toWaterlineModelDef(meta);
  const {
    primaryKey,
    attributes,
    ...rest
  } = definition;
  const lifecycleHooks = [
    'beforeCreate',
    'beforeUpdate',
    'beforeDestroy',
    'beforeValidate',
    'afterCreate',
    'afterUpdate',
    'afterDestroy',
    'afterValidate',
  ];
  const lifecycleSet = new Set(lifecycleHooks);
  const lines: string[] = [];
  lines.push(`// This file is generated from ${sourceRelativePath}. Do not edit directly.`);
  lines.push('module.exports = {');
  lines.push(`  primaryKey: '${primaryKey}',`);
  const emittedKeys = new Set<string>([ 'primaryKey', 'attributes', 'identity']);
  const orderedKeys: string[] = [
    'tableName',
    'datastore',
    'schema',
    'autoCreatedAt',
    'autoUpdatedAt',
    'migrate',
    'indexes',
    'archiveModelIdentity',
    'archiveDateField',
  ];
  orderedKeys.forEach(key => {
    const value = rest[key];
    if (value !== undefined) {
      emittedKeys.add(key);
      lines.push(`  ${key}: ${serializeValue(value, 2)},`);
    }
  });
  lines.push('  attributes: {');
  for (const [name, attr] of Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`    ${name}: ${serializeValue(attr, 4)},`);
  }
  lines.push('  },');
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || emittedKeys.has(key) || lifecycleSet.has(key)) {
      continue;
    }
    lines.push(`  ${key}: ${serializeValue(value, 2)},`);
  }
  for (const hook of lifecycleHooks) {
    const handlers = definition[hook as keyof WaterlineModelDefinition] as
      | Function[]
      | undefined;
    if (handlers && handlers.length) {
      if (handlers.length === 1) {
        // Unwrap single handler to avoid array wrapper which might confuse Sails 1.0
        // We use trimLeft() on the first line to align it with the property key
        const indented = indentLines(handlers[0].toString(), 2);
        lines.push(`  ${hook}: ${indented.trimStart()},`);
      } else {
        lines.push(`  ${hook}: [`);
        handlers.forEach(handler => {
          lines.push(`${indentLines(handler.toString(), 4)},`);
        });
        lines.push('  ],');
      }
    }
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function attributeToTsType(attr: AttributeOptions, entities: EntityMeta[], explicitType?: string): string {
  if (attr.collection) {
    return 'unknown[]';
  }
  if (attr.model) {
    const related = entities.find(e => e.entity.identity === attr.model);
    if (related) {
      return `string | number | ${related.className}Attributes`;
    }
    return 'string | number';
  }
  if (attr.type === 'json' && explicitType) {
    return explicitType;
  }
  switch (attr.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'datetime':
      return 'Date';
    case 'json[]':
      return 'unknown[]';
    case 'json':
      return 'JsonMap';
    default:
      return 'unknown';
  }
}

function buildTypeDefinition(meta: EntityMeta, entities: EntityMeta[], propertyTypes: Record<string, string>, localTypes: string, sourceRelativePath: string): string {
  const attributes = meta.attributes;
  const lines: string[] = [];
  lines.push(`// This file is generated from ${sourceRelativePath}. Do not edit directly.`);
  // Import sails to ensure global types are available and to make this a module
  lines.push(`/// <reference path="../sails.ts" />`);
  lines.push(`import { JsonMap } from './types';`);

  const imports = new Set<string>();
  Object.values(attributes).forEach(attr => {
     if (attr.model) {
        const related = entities.find(e => e.entity.identity === attr.model);
        if (related && related.className !== meta.className) {
           imports.add(related.className);
        }
     }
  });
  
  Array.from(imports).sort().forEach(cls => {
      lines.push(`import { ${cls}Attributes } from './${cls}';`);
  });

  lines.push('');
  
  if (localTypes) {
    lines.push(localTypes);
    lines.push('');
  }

  const attributeEntries = Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b));
  const usesJsonMap = attributeEntries.some(([name, attr]) => {
    const explicitType = propertyTypes[name];
    return attributeToTsType(attr, entities, explicitType) === 'JsonMap';
  });
  // if (usesJsonMap) {
  //   lines.push('type JsonMap = { [key: string]: unknown };');
  //   lines.push('');
  // }
  lines.push(`export interface ${meta.className}Attributes extends Sails.WaterlineAttributes {`);
  for (const [name, attr] of attributeEntries) {
    const optionalFlag = attr.required ? '' : '?';
    const explicitType = propertyTypes[name];
    lines.push(`  ${name}${optionalFlag}: ${attributeToTsType(attr, entities, explicitType)};`);
  } 
  lines.push('}');
  lines.push('');
  const interfaceName = meta.className === 'User' ? meta.className : `${meta.className}WaterlineModel`;
  lines.push(`export interface ${interfaceName} extends Sails.Model<${meta.className}Attributes> {`);
  lines.push(`  attributes: ${meta.className}Attributes;`);
  lines.push('}');
  lines.push('');
  lines.push(`declare global {`);
  lines.push(`  var ${meta.className}: ${interfaceName};`);
  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

async function ensureDirectories() {
  await fs.mkdir(API_MODELS_DIR, { recursive: true });
  await fs.mkdir(TYPES_MODELS_DIR, { recursive: true });
}

async function writeOutputs(meta: EntityMeta, entities: EntityMeta[], propertyTypes: Record<string, string>, localTypes: string, sourceRelativePath: string) {
  const jsTarget = path.join(API_MODELS_DIR, `${meta.className}.js`);
  const typeTarget = path.join(TYPES_MODELS_DIR, `${meta.className}.ts`);
  await fs.writeFile(jsTarget, buildModelModule(meta, sourceRelativePath), 'utf8');
  await fs.writeFile(typeTarget, buildTypeDefinition(meta, entities, propertyTypes, localTypes, sourceRelativePath), 'utf8');
  const jsRelative = path.relative(PROJECT_ROOT, jsTarget);
  const typeRelative = path.relative(PROJECT_ROOT, typeTarget);
  console.log(`Generated ${jsRelative} and ${typeRelative}`);
}

async function generateIndexFile(entities: EntityMeta[]) {
  const lines = entities.map(meta => `export * from './${meta.className}';`);
  const indexPath = path.join(TYPES_MODELS_DIR, 'index.ts');
  await fs.writeFile(indexPath, lines.join('\n'), 'utf8');
  console.log(`Generated ${path.relative(PROJECT_ROOT, indexPath)}`);
}

interface ServiceMeta {
  className: string;
  serviceName: string;
  filePath: string;
  exportedMethods: string[];
  methods: Record<string, string>; // name -> signature
  imports: string[];
  localTypes: string[];
}

async function extractServiceMeta(filePath: string): Promise<ServiceMeta> {
  const content = await fs.readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const serviceName = path.basename(filePath, '.ts');
  let className = serviceName;
  const methods: Record<string, string> = {};
  const imports: string[] = [];
  let exportedMethods: string[] = [];
  const localTypes: string[] = [];

  // Find the class declaration
  let classDecl: ts.ClassDeclaration | undefined;
  const shortName = className.replace(/Service$/, '');

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const name = node.name?.text;
      if (name) {
        const isMainClass = !classDecl && (name === className || name === shortName);
        
        if (isMainClass) {
          classDecl = node;
        } else if (name !== className && name !== shortName) {
          // Helper class. Extract it.
          const members: string[] = [];
          node.members.forEach(m => {
              if (ts.isPropertyDeclaration(m)) {
                  const mName = m.name.getText(sourceFile);
                  const mType = m.type ? m.type.getText(sourceFile) : 'any';
                  const mods = m.modifiers ? m.modifiers.map(mod => mod.getText(sourceFile)).join(' ') + ' ' : '';
                  members.push(`  ${mods}${mName}: ${mType};`);
              } else if (ts.isMethodDeclaration(m)) {
                  const mName = m.name.getText(sourceFile);
                  const params = m.parameters.map(p => {
                      const pName = p.name.getText(sourceFile);
                      const pType = p.type ? p.type.getText(sourceFile) : 'any';
                      const optional = p.questionToken || p.initializer ? '?' : '';
                      return `${pName}${optional}: ${pType}`;
                  }).join(', ');
                  const rType = m.type ? m.type.getText(sourceFile) : 'any';
                  const mods = m.modifiers ? m.modifiers
                    .filter(mod => mod.kind !== ts.SyntaxKind.AsyncKeyword)
                    .map(mod => mod.getText(sourceFile)).join(' ') + ' ' : '';
                  members.push(`  ${mods}${mName}(${params}): ${rType};`);
              } else if (ts.isConstructorDeclaration(m)) {
                  const params = m.parameters.map(p => {
                      const pName = p.name.getText(sourceFile);
                      const pType = p.type ? p.type.getText(sourceFile) : 'any';
                      const optional = p.questionToken || p.initializer ? '?' : '';
                      const pMods = p.modifiers ? p.modifiers.map(mod => mod.getText(sourceFile)).join(' ') + ' ' : '';
                      return `${pMods}${pName}${optional}: ${pType}`;
                  }).join(', ');
                  members.push(`  constructor(${params});`);
              }
          });
          const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
          const exportKw = isExported ? 'export ' : '';
          localTypes.push(`${exportKw}declare class ${name} {\n${members.join('\n')}\n}`);
        }
      }
      return;
    } 
    
    if (ts.isVariableStatement(node)) {
        if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword)) {
            return;
        }
        node.declarationList.declarations.forEach(d => {
            if (ts.isIdentifier(d.name)) {
                localTypes.push(`declare const ${d.name.text}: any;`);
            }
        });
        return;
    } 
    
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
        let text = node.getText(sourceFile);
        if (!node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
            text = `export ${text}`;
        }
        localTypes.push(text);
        return;
    }

    if (ts.isSourceFile(node) || ts.isModuleDeclaration(node) || ts.isModuleBlock(node)) {
        ts.forEachChild(node, visit);
    }
  }
  visit(sourceFile);

  if (classDecl) {
    // Extract _exportedMethods property if it exists
    const exportedMethodsProp = classDecl.members.find(m => {
      if (ts.isPropertyDeclaration(m)) {
        const propName = m.name.getText(sourceFile);
        if (propName === '_exportedMethods') {
            console.log(`Found _exportedMethods in ${className}`);
            return true;
        }
      }
      return false;
    }) as ts.PropertyDeclaration | undefined;

    if (exportedMethodsProp && exportedMethodsProp.initializer && ts.isArrayLiteralExpression(exportedMethodsProp.initializer)) {
      exportedMethods = exportedMethodsProp.initializer.elements
        .map(e => e.getText(sourceFile).replace(/['"]/g, ''))
        .filter(s => s);
    }

    // Extract methods
    classDecl.members.forEach(member => {
      if (ts.isMethodDeclaration(member) && member.name) {
        const name = member.name.getText(sourceFile);
        
        // Check modifiers
        const modifiers = ts.getModifiers(member);
        const isPrivate = modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword);
        const isProtected = modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword);
        
        if (isPrivate || isProtected) return;

        // Get parameters
        const rawParams = member.parameters.map(p => {
          const paramName = p.name.getText(sourceFile);
          let paramType = 'any';
          if (p.type) {
            paramType = p.type.getText(sourceFile);
          }
          
          const hasInitializer = !!p.initializer;
          const isOptionalToken = !!p.questionToken;
          
          return { name: paramName, type: paramType, hasInitializer, isOptionalToken };
        });

        // Process parameters for optionality (reverse)
        const params: string[] = [];
        let nextParamIsOptional = true;

        for (let i = rawParams.length - 1; i >= 0; i--) {
            const p = rawParams[i];
            const canBeOptional = p.isOptionalToken || p.hasInitializer;
            const isOptional = canBeOptional && nextParamIsOptional;
            
            if (isOptional) {
                params.unshift(`${p.name}?: ${p.type}`);
                nextParamIsOptional = true;
            } else {
                let type = p.type;
                if (canBeOptional) {
                    type = `${type} | undefined`;
                }
                params.unshift(`${p.name}: ${type}`);
                nextParamIsOptional = false;
            }
        }

        // Get return type
        let returnType = 'any';
        if (member.type) {
          returnType = member.type.getText(sourceFile);
        }

        methods[name] = `(${params.join(', ')}): ${returnType}`;
      }
    });
  }

  // Extract imports
  sourceFile.statements.forEach(stmt => {
    if (ts.isImportDeclaration(stmt)) {
      const moduleSpecifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
      
      if (moduleSpecifier.startsWith('.')) {
          if (stmt.importClause && stmt.importClause.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings)) {
              stmt.importClause.namedBindings.elements.forEach(el => {
                  const name = el.name.text;
                  localTypes.push(`type ${name} = any;`);
              });
          }
          return;
      }

      if (moduleSpecifier.includes('@researchdatabox/redbox-core-types')) {
        const importClause = stmt.importClause?.getText(sourceFile);
        if (importClause) {
          let newClause = importClause;
          const regex = new RegExp(`\\b${serviceName}\\b,?\\s*`, 'g');
          newClause = newClause.replace(regex, '');
          newClause = newClause.replace(/,\s*}/, ' }').replace(/{\s*,/, '{ ');
          
          if (!newClause.match(/{\s*}/)) {
              imports.push(`import ${newClause} from '../../index';`);
          }
        }
      } else {
        imports.push(stmt.getText(sourceFile));
      }
    }
  });

  return { className, serviceName, filePath, exportedMethods, methods, imports, localTypes };
}

function buildServiceTypeDefinition(meta: ServiceMeta, sourceRelativePath: string): string {
  const lines: string[] = [];
  lines.push(`// This file is generated from ${sourceRelativePath}. Do not edit directly.`);
  lines.push(...meta.imports);
  lines.push('');
  
  if (meta.localTypes.length) {
      lines.push(...meta.localTypes);
      lines.push('');
  }

  lines.push(`export interface ${meta.serviceName} {`);
  
  const methodsToExport = meta.exportedMethods.length > 0 ? meta.exportedMethods : Object.keys(meta.methods);
  
  for (const method of methodsToExport) {
    if (meta.methods[method]) {
      lines.push(`  ${method}${meta.methods[method]};`);
    } else {
      lines.push(`  ${method}(...args: any[]): any;`);
    }
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

async function generateServices() {
  const files = await discoverModelFiles(SERVICES_DIR);
  if (!files.length) {
    console.warn(`No service files found in ${SERVICES_DIR}`);
    return;
  }

  await fs.mkdir(TYPES_SERVICES_DIR, { recursive: true });

  const services: ServiceMeta[] = [];
  for (const file of files) {
    const meta = await extractServiceMeta(file);
    services.push(meta);
    const sourceRelativePath = path.relative(PROJECT_ROOT, file);
    const typeDef = buildServiceTypeDefinition(meta, sourceRelativePath);
    await fs.writeFile(path.join(TYPES_SERVICES_DIR, `${meta.serviceName}.ts`), typeDef, 'utf8');
    console.log(`Generated service type for ${meta.serviceName}`);
  }

  // Generate index
  const indexLines = services.map(s => `export * from './${s.serviceName}';`);
  await fs.writeFile(path.join(TYPES_SERVICES_DIR, 'index.ts'), indexLines.join('\n'), 'utf8');

  // Generate globals
  const globalLines = [];
  globalLines.push(`import { ${services.map(s => s.serviceName).join(', ')} } from './index';`);
  globalLines.push('');
  globalLines.push('declare global {');
  for (const s of services) {
    globalLines.push(`  var ${s.serviceName}: ${s.serviceName};`);
  }
  globalLines.push('}');
  await fs.writeFile(path.join(TYPES_SERVICES_DIR, 'globals.ts'), globalLines.join('\n'), 'utf8');
  console.log(`Generated service globals`);
}

async function main() {
  const fileMap = await loadModelModules();
  const entities = getRegisteredEntities();
  if (!entities.length) {
    console.warn('No decorated entities registered. Nothing to generate.');
    return;
  }
  await ensureDirectories();
  for (const meta of entities) {
    const filePath = fileMap.get(meta.className);
    const sourceRelativePath = filePath ? path.relative(PROJECT_ROOT, filePath) : 'unknown source';
    const propertyTypes = filePath ? await extractPropertyTypes(filePath) : {};
    const localTypes = filePath ? await extractLocalTypes(filePath) : '';
    await writeOutputs(meta, entities, propertyTypes, localTypes, sourceRelativePath);
  }
  await generateIndexFile(entities);
  await generateServices();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
