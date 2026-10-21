import Ajv, { type ValidateFunction } from 'ajv';
import { validateSimpleBinding } from '../integration-v2/bindings';
import { createHash } from 'node:crypto';
import { FIGSHARE_PUBLISHING_SCHEMA } from '../../configmodels/FigsharePublishing';
import { ONI_PUBLISHING_SCHEMA } from '../../configmodels/OniPublishing';
import type { PublicationObject, PublicationProviderDefinition } from './contracts';

export function isPublicationObject(value: unknown): value is PublicationObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(isJson);
}
function isJson(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) ? value.every(isJson) : isPublicationObject(value))
  );
}
function schemaObject(value: unknown): PublicationObject {
  if (!isPublicationObject(value)) throw new Error('Invalid built-in publication schema');
  return value;
}
function canonicalUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A publication target URL is required');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Invalid publication target URL');
  return url.href.replace(/\/+$/, '');
}
export function publicationTargetFingerprint(provider: string, identity: string[]): string {
  return `target-v1:${createHash('sha256')
    .update(JSON.stringify([provider, ...identity]))
    .digest('hex')}`;
}
const figshare = schemaObject(FIGSHARE_PUBLISHING_SCHEMA.properties);
const oni = schemaObject(ONI_PUBLISHING_SCHEMA.properties);
function validateBindings(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(validateBindings);
    return;
  }
  if (!isPublicationObject(value)) return;
  if (value.kind !== undefined) {
    if (value.kind === 'path') {
      if (typeof value.path !== 'string') throw new Error('Invalid binding path');
      validateSimpleBinding({ kind: 'path', path: value.path }, 'Publication');
    } else if (value.kind === 'handlebars') {
      if (typeof value.template !== 'string') throw new Error('Invalid binding template');
      validateSimpleBinding({ kind: 'handlebars', template: value.template }, 'Publication');
    } else if (value.kind === 'jsonata') {
      if (typeof value.expression !== 'string') throw new Error('Invalid binding expression');
      validateSimpleBinding({ kind: 'jsonata', expression: value.expression }, 'Publication');
    } else if (value.kind === 'crosswalk') {
      if (
        typeof value.crosswalkId !== 'string' ||
        !value.crosswalkId.trim() ||
        typeof value.sourceVocabularyId !== 'string' ||
        !value.sourceVocabularyId.trim() ||
        !isPublicationObject(value.source) ||
        value.source.kind === 'crosswalk'
      )
        throw new Error('Invalid crosswalk reference');
    } else throw new Error('Invalid binding kind');
  }
  Object.values(value).forEach(validateBindings);
}
function definition(
  id: string,
  sections: PublicationObject,
  secretPaths: string[],
  identity: (config: PublicationObject) => string
): PublicationProviderDefinition {
  const schema: PublicationObject = {
    type: 'object',
    required: ['connection', 'mapping', 'attachments', 'providerOptions'],
    properties: sections,
  };
  // Existing editor widget/default annotations are intentionally retained.
  let validate: ValidateFunction | undefined;
  return {
    id,
    contractVersion: 2,
    stateVersion: 1,
    configurationSchema: schema,
    secretPaths,
    mutationRecovery: { mode: 'no-remote-lookup' },
    capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: id === 'oni' },
    validateConfiguration: value => {
      validate ??= new Ajv({ strict: false, allErrors: true }).compile(schema);
      if (!isPublicationObject(value) || !validate(value))
        return {
          valid: false,
          issues: [{ path: '', code: 'provider-schema', message: `Invalid ${id} destination configuration` }],
        };
      try {
        validateBindings(value.mapping);
        validateBindings(value.attachments);
        validateBindings(value.providerOptions);
      } catch {
        return {
          valid: false,
          issues: [{ path: '/mapping', code: 'invalid-binding', message: 'Invalid publication binding or expression' }],
        };
      }
      try {
        if (value.enabled === true) identity(value);
      } catch {
        return {
          valid: false,
          issues: [
            { path: '/connection', code: 'target-identity', message: `Incomplete or invalid ${id} target identity` },
          ],
        };
      }
      return { valid: true, value };
    },
    targetFingerprint: identity,
  };
}
/** Configuration definitions only. Execution adapters arrive in PUB-09/PUB-11. */
export const BUILTIN_PUBLICATION_DEFINITIONS: readonly PublicationProviderDefinition[] = [
  definition(
    'figshare',
    {
      connection: {
        type: 'object',
        properties: {
          ...schemaObject(schemaObject(figshare.connection).properties),
          accountId: { type: 'string', minLength: 1 },
        },
      },
      mapping: {
        type: 'object',
        properties: { metadata: figshare.metadata, authors: figshare.authors, categories: figshare.categories },
      },
      attachments: { type: 'object', properties: { selection: figshare.selection, assets: figshare.assets } },
      providerOptions: {
        type: 'object',
        properties: {
          article: figshare.article,
          impersonation: figshare.impersonation,
          embargo: figshare.embargo,
          record: figshare.record,
          writeBack: figshare.writeBack,
        },
      },
    },
    ['connection.token'],
    config => {
      const connection = config.connection;
      if (!isPublicationObject(connection) || typeof connection.accountId !== 'string' || !connection.accountId.trim())
        throw new Error('Verified Figshare account identity is required');
      return publicationTargetFingerprint('figshare', [canonicalUrl(connection.baseUrl), connection.accountId.trim()]);
    }
  ),
  definition(
    'oni',
    {
      connection: {
        type: 'object',
        properties: {
          ...schemaObject(schemaObject(schemaObject(oni.sites).additionalProperties).properties),
          storage: {
            type: 'object',
            properties: {
              driver: { const: 'flydrive' },
              diskName: { type: 'string' },
              rootPath: { type: 'string' },
              prefix: { type: 'string' },
              workspacePath: { type: 'string' },
              tempDir: { type: 'string' },
              keyEncoding: { enum: ['flydrive', 'raw'] },
            },
          },
          ingestion: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: false },
              apiUrl: { type: 'string' },
              adminToken: { type: 'string' },
              forceReindex: { type: 'boolean', default: false },
              pollIntervalMs: { type: 'integer', minimum: 1 },
              timeoutMs: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
      mapping: oni.mapping,
      attachments: oni.selection,
      providerOptions: { type: 'object', properties: { rootCollection: oni.rootCollection, metadata: oni.metadata } },
    },
    ['connection.ingestion.adminToken'],
    config => {
      const connection = config.connection;
      const options = config.providerOptions;
      const storage = isPublicationObject(connection) ? connection.storage : undefined;
      const root = isPublicationObject(options) ? options.rootCollection : undefined;
      if (
        !isPublicationObject(storage) ||
        !isPublicationObject(root) ||
        storage.driver !== 'flydrive' ||
        ![storage.diskName, storage.rootPath, root.targetRepoNamespace].every(
          value => typeof value === 'string' && value.trim()
        )
      )
        throw new Error('Oni repository identity is required');
      // Adapter enablement must additionally verify the actual Flydrive storage namespace.
      return publicationTargetFingerprint('oni', [
        String(storage.diskName),
        String(storage.rootPath).replace(/\/+$/, ''),
        String(storage.prefix ?? '').replace(/^\/+|\/+$/g, ''),
        String(root.targetRepoNamespace),
      ]);
    }
  ),
];
