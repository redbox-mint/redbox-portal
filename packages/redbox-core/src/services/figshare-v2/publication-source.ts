import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { cloneDeep } from 'lodash';
import type {
  PublicationObject,
  PublicationSourcePreparation,
  PublicationProviderSourceInputs,
} from '../publication/contracts';
import { isPublicationObject } from '../publication/builtins';
import { publicationDigest } from '../publication/canonical';
import { figshareJson } from './publication-state';
import {
  figshareDestinationConfiguration,
  figsharePreparedConfiguration,
  figsharePublicationOutputPaths,
} from './publication-config';
import { figsharePublicationContext } from './publication-context';
import { figshareCrosswalkResolver, type FigshareCrosswalkRequest, type CrosswalkResolver } from './bindings';
import { getSelectedDataLocations } from './plan';
import { getAttachmentStream, getAttachmentFingerprint } from './assets';
import type { RecordModel } from './types';
import type { QueuedFigshareService } from './worker';
import type { ResolvedFigsharePublishingConfigData } from './config';

// Datastream fingerprints identify byte changes. Cache only digests actually read under a stable fingerprint.
const attachmentDigests = new Map<string, { size: number; digest: string }>();

export interface PublicationFigshareService extends QueuedFigshareService {
  getConfig(record: RecordModel): ResolvedFigsharePublishingConfigData | null;
  buildMetadataPayload(
    config: ResolvedFigsharePublishingConfigData,
    record: RecordModel
  ): Promise<Record<string, unknown>>;
}
export function figshareSourceRecord(value: PublicationObject, oid: string, brandId: string): RecordModel {
  if (
    (value.redboxOid !== undefined && value.redboxOid !== oid) ||
    !isPublicationObject(value.metaMetadata) ||
    value.metaMetadata.brandId !== brandId ||
    !isPublicationObject(value.metadata)
  )
    throw new Error('Invalid Figshare source record identity');
  // Storage already validates full record structure; this guard establishes the fields the adapter consumes.
  return {
    ...cloneDeep(value),
    redboxOid: oid,
    id: typeof value.id === 'string' ? value.id : oid,
    metaMetadata: { ...value.metaMetadata, brandId },
    metadata: { ...value.metadata },
  } as RecordModel;
}
async function crosswalkRevision(brandId: string, id: string, vocabulary: string): Promise<string> {
  if (typeof PublicationVocabularyService !== 'undefined') {
    const revision = await PublicationVocabularyService.approvedRevision(brandId, id, vocabulary);
    if (revision !== null) return revision;
  }
  const row: unknown = await FigshareVocabularyCrosswalk.findOne({ id, branding: brandId });
  if (
    !isPublicationObject(row) ||
    row.status !== 'approved' ||
    row.localVocabulary !== vocabulary ||
    !Number.isSafeInteger(row.approvedRevision) ||
    Number(row.approvedRevision) < 1
  )
    throw new Error('Figshare crosswalk has no matching approved revision');
  return String(row.approvedRevision);
}
function crosswalkReferences(value: unknown): Array<{ crosswalkId: string; sourceVocabularyId: string }> {
  if (Array.isArray(value)) return value.flatMap(crosswalkReferences);
  if (!isPublicationObject(value)) return [];
  if (
    value.kind === 'crosswalk' &&
    typeof value.crosswalkId === 'string' &&
    typeof value.sourceVocabularyId === 'string'
  )
    return [{ crosswalkId: value.crosswalkId, sourceVocabularyId: value.sourceVocabularyId }];
  return Object.values(value).flatMap(crosswalkReferences);
}
export async function prepareFigshareSource(
  input: PublicationSourcePreparation<PublicationObject>,
  service: PublicationFigshareService
): Promise<PublicationObject> {
  const base = figshareDestinationConfiguration(input.configuration);
  base.connection.token = ''; // No secrets or provider calls during approval.
  const record = figshareSourceRecord(input.record, input.oid, input.brandId);
  const crosswalks: PublicationObject = {};
  const references = crosswalkReferences(input.configuration);
  for (const reference of references) {
    const revision = await crosswalkRevision(input.brandId, reference.crosswalkId, reference.sourceVocabularyId);
    crosswalks[reference.crosswalkId] = { sourceVocabularyId: reference.sourceVocabularyId, revision, resolutions: {} };
  }
  const resolve: NonNullable<CrosswalkResolver['resolveCrosswalkValues']> = async request => {
    const entry = crosswalks[request.crosswalkId];
    if (
      !isPublicationObject(entry) ||
      !isPublicationObject(entry.resolutions) ||
      request.brandId !== input.brandId ||
      entry.sourceVocabularyId !== request.sourceVocabularyId
    )
      throw new Error('Custom Figshare crosswalk must be declared in destination configuration');
    if (!['categoryId', 'sourceId', 'label'].includes(request.outputs))
      throw new Error('Invalid Figshare crosswalk output');
    const outputs =
      request.outputs === 'categoryId' ? 'categoryId' : request.outputs === 'sourceId' ? 'sourceId' : 'label';
    const result = await FigshareVocabularyService.resolveCrosswalkValues({ ...request, outputs });
    if ((await crosswalkRevision(input.brandId, request.crosswalkId, request.sourceVocabularyId)) !== entry.revision)
      throw new Error('Figshare crosswalk changed during approval');
    entry.resolutions[publicationDigest(request)] = figshareJson(result);
    return result;
  };
  return figsharePublicationContext.run(
    { oid: input.oid, brandId: input.brandId, configuration: base, preflight: true },
    () =>
      figshareCrosswalkResolver.run(resolve, async () => {
        const config = service.getConfig(record);
        if (!config) throw new Error('Figshare override disabled the selected destination');
        const localPayload = figshareJson(await service.buildMetadataPayload(config, record));
        const configuration = figshareJson({
          ...config,
          connection: { ...config.connection, token: '' },
          processing: undefined,
          runtime: undefined,
        });
        return {
          localPayload,
          configuration,
          crosswalks,
          outputPaths: figsharePublicationOutputPaths(input.configuration),
        };
      })
  );
}
/** Replays only resolutions captured under the approved crosswalk revisions. */
export async function resolveSealedFigshareCrosswalk(
  prepared: PublicationObject,
  request: FigshareCrosswalkRequest
): Promise<Awaited<ReturnType<NonNullable<CrosswalkResolver['resolveCrosswalkValues']>>>> {
  const entry = isPublicationObject(prepared.crosswalks) ? prepared.crosswalks[request.crosswalkId] : undefined;
  const result =
    isPublicationObject(entry) && isPublicationObject(entry.resolutions)
      ? entry.resolutions[publicationDigest(request)]
      : undefined;
  if (
    !isPublicationObject(result) ||
    !Array.isArray(result.values) ||
    !result.values.every(value => typeof value === 'string' || typeof value === 'number') ||
    !Array.isArray(result.normalizedCodes) ||
    !result.normalizedCodes.every((value): value is string => typeof value === 'string') ||
    !Array.isArray(result.unresolvedCodes) ||
    !result.unresolvedCodes.every((value): value is string => typeof value === 'string') ||
    !Array.isArray(result.historicalTargets)
  )
    throw new Error('Figshare crosswalk resolution is outside the sealed approval');
  const historicalTargets = result.historicalTargets.map(value => {
    if (
      !isPublicationObject(value) ||
      typeof value.code !== 'string' ||
      typeof value.categoryId !== 'number' ||
      typeof value.sourceId !== 'string'
    )
      throw new Error('Invalid sealed historical category');
    return { code: value.code, categoryId: value.categoryId, sourceId: value.sourceId };
  });
  return {
    values: result.values,
    normalizedCodes: result.normalizedCodes,
    unresolvedCodes: result.unresolvedCodes,
    historicalTargets,
  };
}
export function describeFigshareSource(
  input: PublicationSourcePreparation<PublicationObject>,
  prepared: PublicationObject
): PublicationProviderSourceInputs {
  const config = figsharePreparedConfiguration(prepared.configuration);
  const record = figshareSourceRecord(input.record, input.oid, input.brandId);
  return {
    mappingContextVersion: 1,
    managedFields: [
      ...new Set([
        ...Object.keys(isPublicationObject(prepared.localPayload) ? prepared.localPayload : {}),
        ...(config.authors.contributorPaths.length ? ['authors'] : []),
      ]),
    ].map(key => `article.${key}`),
    relatedInputs: {},
    attachments: config.assets.enableHostedFiles
      ? getSelectedDataLocations(config, record)
          .filter(entry => entry.type === 'attachment')
          .map(entry => {
            const id = String(entry.fileId ?? '');
            const logicalPath = String(entry.name ?? '');
            if (!id || !logicalPath) throw new Error('Selected Figshare attachment requires ID and name');
            return {
              id,
              logicalPath,
              original: { oid: input.oid, fileId: id },
              inspect: async () => {
                const changeToken = await getAttachmentFingerprint(input.oid, id, true);
                const response = await getAttachmentStream(input.oid, id, true);
                if (!(response.readstream instanceof Readable))
                  throw new Error('Datastream must expose a Node readable');
                const cacheKey = changeToken ? JSON.stringify([input.brandId, input.oid, id, changeToken]) : undefined;
                const cached = cacheKey ? attachmentDigests.get(cacheKey) : undefined;
                if (cached && response.size === cached.size) {
                  response.readstream.destroy();
                  if ((await getAttachmentFingerprint(input.oid, id, true)) !== changeToken)
                    throw new Error('Figshare attachment changed during inspection');
                  return { ...cached, changeToken };
                }
                const hash = createHash('sha256');
                let size = 0;
                try {
                  for await (const chunk of response.readstream) {
                    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    hash.update(bytes);
                    size += bytes.length;
                  }
                } finally {
                  response.readstream.destroy();
                }
                if ((await getAttachmentFingerprint(input.oid, id, true)) !== changeToken)
                  throw new Error('Figshare attachment changed while hashing');
                const identity = { size, digest: hash.digest('hex') };
                if (cacheKey) {
                  if (attachmentDigests.size >= 128) attachmentDigests.delete(attachmentDigests.keys().next().value!);
                  attachmentDigests.set(cacheKey, identity);
                }
                return { ...identity, ...(changeToken ? { changeToken } : {}) };
              },
              open: async () => {
                const response = await getAttachmentStream(input.oid, id, true);
                if (!(response.readstream instanceof Readable))
                  throw new Error('Datastream must expose a Node readable');
                return response.readstream;
              },
            };
          })
      : [],
    resolveCrosswalk: async request => {
      const entry = isPublicationObject(prepared.crosswalks) ? prepared.crosswalks[request.crosswalkId] : undefined;
      if (
        !isPublicationObject(entry) ||
        typeof entry.revision !== 'string' ||
        entry.sourceVocabularyId !== request.sourceVocabularyId ||
        request.brandId !== input.brandId
      )
        throw new Error('Figshare crosswalk is outside the prepared destination');
      return { brandId: input.brandId, crosswalkId: request.crosswalkId, revisionId: entry.revision, value: entry };
    },
  };
}
