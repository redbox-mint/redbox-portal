import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  AttributeOptions,
  EntityMeta,
  getRegisteredEntities,
  toWaterlineModelDef,
  WaterlineModelDefinition,
} from '../typescript/lib/decorators';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'typescript', 'src', 'models');
const API_MODELS_DIR = path.join(PROJECT_ROOT, 'api', 'models');
const TYPES_MODELS_DIR = path.join(
  PROJECT_ROOT,
  'packages',
  'redbox-core-types',
  'src',
  'models',
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

function buildModelModule(meta: EntityMeta): string {
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

function buildTypeDefinition(meta: EntityMeta, entities: EntityMeta[], propertyTypes: Record<string, string> = {}, localTypes: string = ''): string {
  const attributes = meta.attributes;
  const lines: string[] = [];
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

async function writeOutputs(meta: EntityMeta, entities: EntityMeta[], propertyTypes: Record<string, string>, localTypes: string) {
  const jsTarget = path.join(API_MODELS_DIR, `${meta.className}.js`);
  const typeTarget = path.join(TYPES_MODELS_DIR, `${meta.className}.ts`);
  await fs.writeFile(jsTarget, buildModelModule(meta), 'utf8');
  await fs.writeFile(typeTarget, buildTypeDefinition(meta, entities, propertyTypes, localTypes), 'utf8');
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
    const propertyTypes = filePath ? await extractPropertyTypes(filePath) : {};
    const localTypes = filePath ? await extractLocalTypes(filePath) : '';
    await writeOutputs(meta, entities, propertyTypes, localTypes);
  }
  await generateIndexFile(entities);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
