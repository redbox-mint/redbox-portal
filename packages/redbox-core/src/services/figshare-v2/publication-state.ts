import Ajv from 'ajv';
import { cloneDeep } from 'lodash';
import type { FigshareSyncModel } from '../../model/storage/FigshareSyncModel';
import type { PublicationObject } from '../publication/contracts';
import { isPublicationObject } from '../publication/builtins';

const binding = {
  type: 'object',
  required: ['namespace', 'accountId', 'ownerId'],
  properties: Object.fromEntries(
    ['namespace', 'accountId', 'ownerId', 'articleId', 'observedOwnerId'].map(key => [
      key,
      { type: 'string', minLength: 1 },
    ])
  ),
};
const work = {
  type: 'object',
  required: ['requested', 'processed', 'dueAt', 'sourceGeneration', 'policies', 'requestedBy'],
  properties: {
    requested: { type: 'integer', minimum: 0 },
    processed: { type: 'integer', minimum: 0 },
    dueAt: { type: ['integer', 'null'] },
    sourceGeneration: { type: 'integer', minimum: 0 },
    requestedBy: { type: 'string' },
    policies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'policyId', 'condition'],
        properties: {
          kind: { enum: ['sync', 'cleanup'] },
          policyId: { type: 'string' },
          condition: { type: 'string' },
        },
      },
    },
  },
};
const validateLegacy = new Ajv({ strict: false }).compile<FigshareSyncModel>({
  type: 'object',
  required: [
    'oid',
    'brandId',
    'revision',
    'importedGeneration',
    'work',
    'nextActionAt',
    'dispatchUntil',
    'leaseOwner',
    'leaseUntil',
    'receipts',
    'checkpoints',
    'status',
  ],
  properties: {
    oid: { type: 'string', minLength: 1 },
    brandId: { type: 'string', minLength: 1 },
    revision: { type: 'integer', minimum: 0 },
    importedGeneration: { type: 'integer', minimum: 0 },
    nextActionAt: { type: ['integer', 'null'] },
    dispatchUntil: { type: 'integer' },
    leaseOwner: { type: ['string', 'null'] },
    leaseUntil: { type: 'integer' },
    work: {
      type: 'object',
      required: ['sync', 'cleanup', 'observe'],
      properties: { sync: work, cleanup: work, observe: work },
    },
    binding,
    create: {
      type: 'object',
      required: ['token', 'binding', 'startedAt', 'outcome'],
      properties: {
        token: { type: 'string', minLength: 1 },
        binding,
        startedAt: { type: 'string' },
        outcome: { enum: ['submitted', 'uncertain', 'failed', 'confirmed'] },
        verifiedId: { type: 'string' },
        error: { type: 'string' },
      },
    },
    publish: {
      type: 'object',
      required: ['generation', 'hash', 'previousVersion', 'outcome', 'submittedAt'],
      properties: {
        generation: { type: 'integer', minimum: 0 },
        hash: { type: 'string' },
        previousVersion: { type: 'number', minimum: 0 },
        outcome: { enum: ['submitted', 'accepted', 'uncertain', 'rejected', 'observed'] },
        submittedAt: { type: 'string' },
      },
    },
    receipts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'localId', 'digest', 'size', 'name', 'articleId', 'kind', 'state', 'desired'],
        properties: {
          key: { type: 'string', minLength: 1 },
          localId: { type: 'string' },
          digest: { type: 'string' },
          size: { type: 'integer', minimum: 0 },
          name: { type: 'string' },
          articleId: { type: 'string' },
          fileId: { type: 'string' },
          kind: { enum: ['hosted', 'link'] },
          state: { enum: ['initialising', 'uploading', 'completing', 'available', 'deleting', 'removed'] },
          desired: { type: 'boolean' },
          resumeApproved: { type: 'boolean' },
          fingerprint: { type: 'string' },
          md5: { type: 'string' },
        },
      },
    },
    checkpoints: { type: 'object', additionalProperties: { type: 'string' } },
    status: { enum: ['queued', 'running', 'waiting', 'retrying', 'synced', 'failed', 'repair_required', 'cancelled'] },
  },
});

/** Normalize optional JS values at the JSON boundary; retain all persisted legacy evidence. */
export function figshareJson(value: unknown): PublicationObject {
  const decoded: unknown = JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => {
      if (
        (typeof item === 'number' && !Number.isFinite(item)) ||
        ['function', 'symbol', 'bigint'].includes(typeof item)
      )
        throw new Error('Figshare publication evidence must contain finite JSON values');
      return item;
    })
  );
  if (!isPublicationObject(decoded)) throw new Error('Figshare state/payload must be a JSON object');
  return decoded;
}
export function decodeFigshareLegacy(value: unknown): FigshareSyncModel {
  if (!isPublicationObject(value) || !validateLegacy(value))
    throw new Error('Invalid Figshare evidence; repair without discarding it');
  if (value.binding?.articleId && value.articleId && value.binding.articleId !== value.articleId)
    throw new Error('Conflicting Figshare article identities');
  return cloneDeep(value);
}
/** Version 2 wraps the complete original row, rather than flattening away recovery evidence. */
export function decodeFigshareProviderState(value: unknown, version: number): PublicationObject {
  if (!isPublicationObject(value) || ![1, 2].includes(version)) throw new Error('Unsupported Figshare provider state');
  if (!Object.keys(value).length) return {};
  const result = version === 1 && Object.hasOwn(value, 'receipts') ? { legacy: value } : cloneDeep(value);
  if (!isPublicationObject(result.legacy)) throw new Error('Figshare legacy evidence is missing');
  decodeFigshareLegacy(result.legacy);
  if (result.payload !== undefined && !isPublicationObject(result.payload))
    throw new Error('Invalid Figshare payload checkpoint');
  for (const key of ['payloadApproval', 'syncedApproval', 'changedPayloadApproval', 'assetsBaselineApproval'])
    if (result[key] !== undefined && (typeof result[key] !== 'string' || !result[key]))
      throw new Error('Invalid Figshare approval checkpoint');
  if (
    result.assetsBaseline !== undefined &&
    result.assetsBaseline !== null &&
    typeof result.assetsBaseline !== 'string'
  )
    throw new Error('Invalid Figshare asset baseline');
  if (result.cleanupProjection !== undefined && !isPublicationObject(result.cleanupProjection))
    throw new Error('Invalid Figshare cleanup projection');
  if (
    result.syncedGeneration !== undefined &&
    (!Number.isSafeInteger(result.syncedGeneration) || Number(result.syncedGeneration) < 1)
  )
    throw new Error('Invalid Figshare sync generation');
  return result;
}
export function emptyFigshareEvidence(oid: string, brandId: string): FigshareSyncModel {
  const work = () => ({ requested: 0, processed: 0, dueAt: null, sourceGeneration: 0, policies: [], requestedBy: '' });
  return {
    oid,
    brandId,
    revision: 0,
    importedGeneration: 0,
    work: { sync: work(), cleanup: work(), observe: work() },
    nextActionAt: null,
    dispatchUntil: 0,
    leaseOwner: null,
    leaseUntil: 0,
    receipts: [],
    checkpoints: {},
    status: 'queued',
  };
}
