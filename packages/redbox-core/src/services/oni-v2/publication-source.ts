import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { firstValueFrom } from 'rxjs';
import { cloneDeep, get } from 'lodash';
import { createOniOcflDesiredContent, sha256 } from './ocflReconciliation';
import { publicationDigest } from '../publication/canonical';
import type {
  PublicationObject,
  PublicationSourcePreparation,
  PublicationProviderSourceInputs,
} from '../publication/contracts';
import { isPublicationObject } from '../publication/builtins';
import {
  oniDestinationConfiguration,
  oniJson,
  oniRepositoryIdentity,
  verifyOniRepositoryBackend,
  assertOniRepositoryConfiguration,
} from './publication-config';
import { buildOniRoCrate } from './crate';
import type {
  OniCrateBuildResult,
  OniRecordModel,
  ResolvedOniPublishingConfigData,
  OniOcflRecoveryRepository,
} from './types';
import type { OniPublishingSiteConfig } from '../../configmodels/OniPublishing';
import type { DatastreamService } from '../../DatastreamService';
import type { PublicationProviderExecution } from '../publication/contracts';

export type OniExecution = PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject>;
export const oniAttachmentIdentity = (oid: string, fileId: string): string => JSON.stringify([oid, fileId]);
export interface OniPublicationHooks {
  configuration(record: OniRecordModel, base: ResolvedOniPublishingConfigData): ResolvedOniPublishingConfigData;
  repository(
    config: ResolvedOniPublishingConfigData,
    site: OniPublishingSiteConfig,
    bytes: Pick<DatastreamService, 'getDatastream'>,
    namespace?: string
  ): OniOcflRecoveryRepository;
  datastream(): Pick<DatastreamService, 'getDatastream' | 'getDatastreamFingerprint'>;
  project(context: OniExecution, config: ResolvedOniPublishingConfigData, datasetUrl: string): Promise<void>;
}
export function oniSourceRecord(value: unknown, oid: string, brandId: string): OniRecordModel {
  if (
    !isPublicationObject(value) ||
    !isPublicationObject(value.metadata) ||
    !isPublicationObject(value.metaMetadata) ||
    value.metaMetadata.brandId !== brandId ||
    (value.redboxOid !== undefined && value.redboxOid !== oid)
  )
    throw new Error('Invalid Oni source identity');
  const meta = value.metaMetadata;
  return {
    ...cloneDeep(value),
    redboxOid: oid,
    metadata: cloneDeep(value.metadata),
    metaMetadata: {
      brandId,
      ...(typeof meta.createdBy === 'string' ? { createdBy: meta.createdBy } : {}),
      ...(typeof meta.createdOn === 'string' ? { createdOn: meta.createdOn } : {}),
    },
  };
}
function person(value: unknown, username: string): PublicationObject {
  if (!value || typeof value !== 'object') throw new Error('Oni history person is unavailable');
  const result: PublicationObject = { username };
  for (const key of [
    'email',
    'name',
    'text_full_name',
    'givenName',
    'given_name',
    'familyName',
    'family_name',
    'orcid',
  ]) {
    const field = Reflect.get(value, key);
    if (typeof field === 'string') result[key] = field;
  }
  if (typeof result.email !== 'string' || !result.email.trim()) throw new Error('Oni history requires email');
  return result;
}
export function decodeOniCrate(value: unknown): OniCrateBuildResult {
  if (
    !isPublicationObject(value) ||
    !isPublicationObject(value.crateJson) ||
    !Array.isArray(value.attachments) ||
    !['datasetUrl', 'rootId', 'rootCollectionId', 'dataRecordOid'].every(
      key => typeof value[key] === 'string' && value[key]
    )
  )
    throw new Error('Invalid sealed Oni crate');
  const attachments = value.attachments.map(value => {
    if (
      !isPublicationObject(value) ||
      typeof value.fileId !== 'string' ||
      typeof value.name !== 'string' ||
      typeof value.logicalPath !== 'string' ||
      !isPublicationObject(value.source)
    )
      throw new Error('Invalid sealed Oni attachment');
    return { fileId: value.fileId, name: value.name, logicalPath: value.logicalPath, source: value.source };
  });
  return {
    datasetUrl: String(value.datasetUrl),
    rootId: String(value.rootId),
    rootCollectionId: String(value.rootCollectionId),
    dataRecordOid: String(value.dataRecordOid),
    attachments,
    crateJson: value.crateJson,
  };
}
export async function prepareOniSource(
  input: PublicationSourcePreparation<PublicationObject>,
  hooks: OniPublicationHooks
): Promise<PublicationObject> {
  await verifyOniRepositoryBackend(input.configuration);
  const record = oniSourceRecord(input.record, input.oid, input.brandId);
  const config = hooks.configuration(record, oniDestinationConfiguration(input.configuration));
  assertOniRepositoryConfiguration(input.configuration, config);
  const generated = input.generatedValues;
  const key = `oni:${input.destinationId}:history`;
  let history = generated[key];
  if (history === undefined) {
    const creator = String(record.metaMetadata?.createdBy ?? '');
    if (!creator) throw new Error('Oni source creator is missing');
    const creatorUser = await firstValueFrom(UsersService.getUserWithUsername(creator));
    const approverUser =
      creator === input.approver.username
        ? creatorUser
        : await firstValueFrom(UsersService.getUserWithUsername(input.approver.username));
    history = { creator: person(creatorUser, creator), approver: person(approverUser, input.approver.username) };
    generated[key] = history;
  }
  if (
    !isPublicationObject(history) ||
    !isPublicationObject(history.creator) ||
    !isPublicationObject(history.approver) ||
    history.approver.username !== input.approver.username ||
    history.creator.username !== record.metaMetadata?.createdBy
  )
    throw new Error('Invalid Oni historical attribution');
  if (
    typeof generated.publicationTimestamp !== 'string' ||
    !Number.isFinite(Date.parse(generated.publicationTimestamp))
  )
    throw new Error('Oni requires a stable publication timestamp');
  const crate = await buildOniRoCrate({
    config,
    site: config.sites.publication,
    siteName: 'publication',
    oid: input.oid,
    record,
    creator: history.creator,
    approver: history.approver,
    publicationTimestamp: generated.publicationTimestamp,
    ...(typeof get(record, config.writeBack.citationUrlPath) === 'string' &&
    get(record, config.writeBack.citationUrlPath)
      ? { datasetUrl: String(get(record, config.writeBack.citationUrlPath)) }
      : {}),
  });
  const url = new URL(crate.datasetUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Invalid Oni citation URL');
  const metadata = Buffer.from(JSON.stringify(crate.crateJson, null, 2));
  createOniOcflDesiredContent(config.metadata.jsonldFilename, [
    { logicalPath: config.metadata.jsonldFilename, size: metadata.length, sha256: sha256(metadata) },
    ...crate.attachments.map(file => ({ logicalPath: file.logicalPath, size: 0, sha256: '0'.repeat(64) })),
  ]);
  // Snapshot the actual overridden mapping output. No current people/config/attachment streams are read at commit.
  const site = config.sites.publication;
  return oniJson({
    crate,
    namespace: oniRepositoryIdentity(input.configuration),
    material: {
      rootCollection: config.rootCollection,
      metadata: config.metadata,
      selection: config.selection,
      mapping: config.mapping,
      writeBack: config.writeBack,
      publicUrl: site.publicUrl,
      useCleanUrl: site.useCleanUrl,
      ingestion: {
        enabled: site.ingestion?.enabled === true,
        apiUrl: site.ingestion?.apiUrl ?? '',
        forceReindex: site.ingestion?.forceReindex === true,
      },
    },
    outputPaths: [
      config.writeBack.citationUrlPath,
      config.writeBack.citationDoiPath,
      config.writeBack.publicationErrorPath,
    ],
  });
}
export async function describeOniSource(
  input: PublicationSourcePreparation<PublicationObject>,
  prepared: PublicationObject,
  hooks: OniPublicationHooks
): Promise<PublicationProviderSourceInputs> {
  const crate = decodeOniCrate(prepared.crate);
  const relatedInputs: PublicationProviderSourceInputs['relatedInputs'] = {};
  if (crate.attachments.length) {
    const parent = await RecordsService.getPublicationStorage().getMeta(crate.dataRecordOid);
    if (!parent || parent.metaMetadata?.brandId !== input.brandId)
      throw new Error('Oni attachment source is absent or belongs to another brand');
    if (crate.dataRecordOid !== input.oid) {
      const value = { oid: crate.dataRecordOid, brandId: input.brandId, revision: parent.revision ?? 0 };
      relatedInputs.dataRecord = {
        brandId: input.brandId,
        id: crate.dataRecordOid,
        version: publicationDigest(value),
        value,
      };
    }
  }
  const reader = hooks.datastream();
  const open = async (fileId: string): Promise<Readable> => {
    const response = await reader.getDatastream(crate.dataRecordOid, fileId);
    if (response.readstream) return new Readable().wrap(response.readstream);
    if (response.body !== undefined) return Readable.from([response.body]);
    throw new Error('Oni attachment bytes are unavailable');
  };
  return {
    mappingContextVersion: 1,
    managedFields: ['ocfl.crate', 'ocfl.files'],
    relatedInputs,
    attachments: crate.attachments.map(attachment => ({
      id: oniAttachmentIdentity(crate.dataRecordOid, attachment.fileId),
      logicalPath: attachment.logicalPath,
      original: { oid: crate.dataRecordOid, fileId: attachment.fileId },
      inspect: async () => {
        const before = await reader.getDatastreamFingerprint?.(crate.dataRecordOid, attachment.fileId);
        const hash = createHash('sha256');
        let size = 0;
        const stream = await open(attachment.fileId);
        try {
          for await (const chunk of stream) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            hash.update(bytes);
            size += bytes.length;
          }
        } finally {
          stream.destroy();
        }
        if (before !== (await reader.getDatastreamFingerprint?.(crate.dataRecordOid, attachment.fileId)))
          throw new Error('Oni attachment changed during hashing');
        return { size, digest: hash.digest('hex'), ...(before ? { changeToken: before } : {}) };
      },
      open: () => open(attachment.fileId),
    })),
    resolveCrosswalk: async () => {
      throw new Error('Oni has no crosswalk bindings');
    },
  };
}
