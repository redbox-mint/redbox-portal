import Ajv from 'ajv';
import { cloneDeep } from 'lodash';
import { isPublicationObject } from '../publication/builtins';
import type { PublicationObject } from '../publication/contracts';
import { createOniOcflDesiredContent } from './ocflReconciliation';
import type { OniOcflDesiredContent, OniOcflObjectEvidence } from './types';
import { decodeOniCrate } from './publication-source';
const valid = new Ajv({ strict: false }).compile({
  type: 'object',
  properties: {
    request: { type: 'string', minLength: 1 },
    prepared: { type: 'object' },
    submitted: { type: 'object' },
    confirmed: { type: 'object' },
    ingestion: { type: 'object' },
    projection: { type: 'object' },
  },
});
export function decodeOniState(value: unknown, version: number): PublicationObject {
  if (version !== 1 || !isPublicationObject(value) || !valid(value))
    throw new Error('Invalid Oni provider state; retain evidence');
  if (Object.keys(value).length && typeof value.request !== 'string') throw new Error('Oni state request is missing');
  if (value.prepared !== undefined) {
    if (!isPublicationObject(value.prepared)) throw new Error('Invalid Oni prepared checkpoint');
    decodeOniCrate(value.prepared.crate);
    decodeOniDesired(value.prepared.desired);
  }
  if (value.confirmed !== undefined) decodeOniEvidence(value.confirmed);
  if (
    value.submitted !== undefined &&
    (!isPublicationObject(value.submitted) || typeof value.submitted.operationId !== 'string')
  )
    throw new Error('Invalid Oni submitted checkpoint');
  if (isPublicationObject(value.submitted)) {
    decodeOniEvidence(value.submitted.prior);
    decodeOniDesired(value.submitted.desired);
  }
  if (value.ingestion !== undefined) {
    const ingestion = value.ingestion;
    if (
      !isPublicationObject(ingestion) ||
      !['pending', 'confirmed', 'not_required'].includes(String(ingestion.state)) ||
      typeof ingestion.depositInventory !== 'string' ||
      !value.confirmed
    )
      throw new Error('Invalid Oni ingestion checkpoint');
    for (const type of ['structural', 'search']) {
      const index = ingestion[type];
      if (
        index !== undefined &&
        (!isPublicationObject(index) ||
          typeof index.ready !== 'boolean' ||
          typeof index.operationId !== 'string' ||
          typeof index.requestedAt !== 'string' ||
          (index.ready === true && (typeof index.count !== 'number' || index.count < 1)))
      )
        throw new Error('Invalid Oni index checkpoint');
      if (ingestion.state === 'confirmed' && (!isPublicationObject(index) || index.ready !== true))
        throw new Error('Oni ingestion confirmation requires both indexes');
    }
  }
  if (
    value.projection !== undefined &&
    (!isPublicationObject(value.projection) ||
      typeof value.projection.confirmedAt !== 'string' ||
      !isPublicationObject(value.ingestion) ||
      !['confirmed', 'not_required'].includes(String(value.ingestion.state)))
  )
    throw new Error('Invalid Oni projection checkpoint');
  return cloneDeep(value);
}
export function decodeOniDesired(value: unknown): OniOcflDesiredContent {
  if (
    !isPublicationObject(value) ||
    value.schemaVersion !== 1 ||
    typeof value.metadataLogicalPath !== 'string' ||
    !Array.isArray(value.files)
  )
    throw new Error('Invalid Oni desired manifest');
  const files = value.files.map(file => {
    if (
      !isPublicationObject(file) ||
      typeof file.logicalPath !== 'string' ||
      typeof file.size !== 'number' ||
      typeof file.sha256 !== 'string'
    )
      throw new Error('Invalid Oni desired file');
    return { logicalPath: file.logicalPath, size: file.size, sha256: file.sha256 };
  });
  const desired = createOniOcflDesiredContent(value.metadataLogicalPath, files);
  if (desired.digest !== value.digest) throw new Error('Invalid Oni desired digest');
  return desired;
}
export function decodeOniEvidence(value: unknown): OniOcflObjectEvidence {
  if (
    !isPublicationObject(value) ||
    value.schemaVersion !== 1 ||
    typeof value.objectId !== 'string' ||
    typeof value.storageIdentity !== 'string'
  )
    throw new Error('Invalid Oni prior evidence');
  const common = { schemaVersion: 1 as const, objectId: value.objectId, storageIdentity: value.storageIdentity };
  if (value.kind === 'absent') return { ...common, kind: 'absent' };
  if (
    value.kind !== 'present' ||
    typeof value.head !== 'string' ||
    typeof value.inventoryDigest !== 'string' ||
    !isPublicationObject(value.versionInventoryDigests)
  )
    throw new Error('Invalid Oni inventory evidence');
  const versions: Record<string, string> = {};
  for (const [key, digest] of Object.entries(value.versionInventoryDigests)) {
    if (typeof digest !== 'string') throw new Error('Invalid Oni version digest');
    versions[key] = digest;
  }
  return {
    ...common,
    kind: 'present',
    head: value.head,
    inventoryDigest: value.inventoryDigest,
    versionInventoryDigests: versions,
    content: decodeOniDesired(value.content),
  };
}
