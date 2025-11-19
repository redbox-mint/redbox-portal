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

async function loadModelModules(): Promise<void> {
  const files = await discoverModelFiles(MODELS_DIR);
  if (!files.length) {
    console.warn(`No model files found in ${MODELS_DIR}`);
    return;
  }

  for (const file of files) {
    // The generator executes through ts-node which registers a require hook for TypeScript files.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(file);
  }
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
    return value.toString();
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
  const { identity, tableName, primaryKey, attributes } = definition;
  const lines: string[] = [];
  lines.push('module.exports = {');
  lines.push(`  identity: '${identity}',`);
  if (tableName) {
    lines.push(`  tableName: '${tableName}',`);
  }
  lines.push(`  primaryKey: '${primaryKey}',`);
  lines.push('  attributes: {');
  for (const [name, attr] of Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`    ${name}: ${serializeValue(attr, 4)},`);
  }
  lines.push('  },');
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
  for (const hook of lifecycleHooks) {
    const handlers = definition[hook as keyof WaterlineModelDefinition] as
      | Function[]
      | undefined;
    if (handlers && handlers.length) {
      lines.push(`  ${hook}: [`);
      handlers.forEach(handler => {
        lines.push(`${indentLines(handler.toString(), 4)},`);
      });
      lines.push('  ],');
    }
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function attributeToTsType(attr: AttributeOptions): string {
  if (attr.collection) {
    return 'unknown[]';
  }
  if (attr.model) {
    return 'string | number';
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
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

function buildTypeDefinition(meta: EntityMeta): string {
  const attributes = meta.attributes;
  const lines: string[] = [];
  lines.push(`import '../sails';`);
  lines.push('');
  lines.push(`export interface ${meta.className} {`);
  for (const [name, attr] of Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b))) {
    const optionalFlag = attr.required ? '' : '?';
    lines.push(`  ${name}${optionalFlag}: ${attributeToTsType(attr)};`);
  }
  lines.push('}');
  lines.push('');
  lines.push(`export interface ${meta.className}Model extends Sails.Model {`);
  lines.push(`  attributes: ${meta.className};`);
  lines.push('}');
  lines.push('');
  lines.push('declare global {');
  lines.push(`  const ${meta.className}: ${meta.className}Model;`);
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

async function ensureDirectories() {
  await fs.mkdir(API_MODELS_DIR, { recursive: true });
  await fs.mkdir(TYPES_MODELS_DIR, { recursive: true });
}

async function writeOutputs(meta: EntityMeta) {
  const jsTarget = path.join(API_MODELS_DIR, `${meta.entity.identity}.js`);
  const typeTarget = path.join(TYPES_MODELS_DIR, `${meta.className}.d.ts`);
  await fs.writeFile(jsTarget, buildModelModule(meta), 'utf8');
  await fs.writeFile(typeTarget, buildTypeDefinition(meta), 'utf8');
  const jsRelative = path.relative(PROJECT_ROOT, jsTarget);
  const typeRelative = path.relative(PROJECT_ROOT, typeTarget);
  console.log(`Generated ${jsRelative} and ${typeRelative}`);
}

async function main() {
  await loadModelModules();
  const entities = getRegisteredEntities();
  if (!entities.length) {
    console.warn('No decorated entities registered. Nothing to generate.');
    return;
  }
  await ensureDirectories();
  for (const meta of entities) {
    await writeOutputs(meta);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
