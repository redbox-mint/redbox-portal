import path from 'path';
import _ from 'lodash';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import type { Services as StorageManagerServices } from '../StorageManagerService';
import { FigshareClient } from './http';
import { ResolvedFigsharePublishingConfigData } from './config';
import {
  RecordModel,
  FigshareArticle,
  FigshareFile,
  FigshareUploadPart,
  FigshareSyncState,
  DataLocationEntry,
  AssetSyncResult,
} from './types';
import { setSyncState } from './config';
import { getSelectedDataLocations } from './plan';

type IDisk = StorageManagerServices.IDisk;

const LINK_FILE_CREATE_RETRY_COUNT = 3;
const FIGSHARE_UPLOAD_PENDING_STATUS = 'created';

function getRecordOid(record: RecordModel): string {
  return record.redboxOid ?? record.id ?? '';
}

function getDatastreamService(): Record<string, unknown> | undefined {
  const recordConfig = (sails.config as Record<string, unknown>).record as Record<string, unknown> | undefined;
  const serviceName = String(recordConfig?.datastreamService ?? '');
  return serviceName
    ? ((sails.services as Record<string, unknown>)?.[serviceName] as Record<string, unknown> | undefined)
    : undefined;
}

function validationError(message: string): RBValidationError {
  return new RBValidationError({
    message,
    displayErrors: [{ title: message, detail: message }],
  });
}

interface DatastreamResponse {
  readstream: NodeJS.ReadableStream;
  size?: number;
}

async function getAttachmentStream(oid: string, fileId: string): Promise<DatastreamResponse> {
  const datastreamService = getDatastreamService();
  if (datastreamService == null) {
    throw new Error('Datastream service is not configured');
  }

  const response = await (
    datastreamService.getDatastream as (oid: string, fileId: string) => Promise<DatastreamResponse>
  )(oid, fileId);
  if (response?.readstream == null) {
    throw new Error(`Unable to read datastream '${fileId}' for record '${oid}'`);
  }
  return response;
}

function sanitizePathComponent(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function getStagingDisk(config: FigsharePublishingConfigData): IDisk {
  const diskName = config.assets.staging.disk?.trim();
  if (!diskName) {
    return StorageManagerService.stagingDisk();
  }
  try {
    return StorageManagerService.disk(diskName);
  } catch (error) {
    // A deployment that overrides storage.disks may not register the default
    // 'figshare-staging' disk. Fall back to the configured staging disk rather
    // than failing the upload before staging starts.
    sails.log.warn(
      `FigService - staging disk '${diskName}' is not registered; falling back to the default staging disk`,
      error
    );
    return StorageManagerService.stagingDisk();
  }
}

function buildStagingKey(
  config: FigsharePublishingConfigData,
  articleId: string,
  oid: string,
  fileId: string,
  fileName: string
): string {
  const prefix = (config.assets.staging.keyPrefix ?? 'figshare/').replace(/^\/+|\/+$/g, '') || 'figshare';
  const safeFileName = path.basename(fileName).trim();
  if (safeFileName === '') {
    throw validationError(`Attachment '${fileName}' does not contain a valid file name`);
  }
  // basename() can still yield the reserved '.'/'..' segments, which would point the
  // staging key at the directory itself or escape it on an fs-backed disk.
  if (safeFileName === '.' || safeFileName === '..') {
    throw validationError(`Attachment '${fileName}' does not contain a valid file name`);
  }
  // Append a per-attempt random segment so concurrent or retried uploads of the
  // same attachment never share a staging key (which would let one attempt
  // overwrite or delete the object another attempt is still streaming).
  const dir = `${sanitizePathComponent(articleId)}-${sanitizePathComponent(oid)}-${sanitizePathComponent(fileId)}-${randomUUID()}`;
  return `${prefix}/${dir}/${safeFileName}`;
}

async function stageAttachmentToDisk(disk: IDisk, key: string, response: DatastreamResponse): Promise<number> {
  const expectedSize = Number(response.size ?? 0);
  await disk.putStream(key, response.readstream as Readable, expectedSize > 0 ? { contentLength: expectedSize } : {});
  const meta = await disk.getMetaData(key);
  return meta.contentLength;
}

async function* readPartsSequentially(
  source: Readable,
  parts: FigshareUploadPart[]
): AsyncGenerator<{ partNo: number; stream: Readable }> {
  const ordered = [...parts].sort((a, b) => a.startOffset - b.startOffset);
  let consumed = 0;
  let carry = Buffer.alloc(0);
  const iterator = source[Symbol.asyncIterator]();

  for (const part of ordered) {
    const partSize = part.endOffset - part.startOffset + 1;
    if (part.startOffset !== consumed) {
      throw validationError(`Figshare upload part ${part.partNo} starts at ${part.startOffset}; expected ${consumed}`);
    }

    async function* partStream(): AsyncGenerator<Buffer> {
      let need = partSize;
      while (need > 0) {
        if (carry.length === 0) {
          const { value, done } = await iterator.next();
          if (done === true) {
            throw validationError(
              `Staged object truncated at offset ${consumed}; expected more bytes for part ${part.partNo}`
            );
          }
          carry = Buffer.isBuffer(value) ? value : Buffer.from(value);
        }

        const take = Math.min(need, carry.length);
        const chunk = carry.subarray(0, take);
        carry = carry.subarray(take);
        need -= take;
        consumed += take;
        yield chunk;
      }
    }

    yield { partNo: part.partNo, stream: Readable.from(partStream()) };
  }
}

async function listArticleFiles(client: FigshareClient, articleId: string): Promise<FigshareFile[]> {
  const currentFiles: FigshareFile[] = [];
  let page = 1;
  const pageSize = 20;
  while (true) {
    const pageResults = await client.listArticleFiles(articleId, page, pageSize);
    if (!Array.isArray(pageResults) || pageResults.length === 0) {
      break;
    }
    currentFiles.push(...pageResults);
    if (pageResults.length < pageSize) {
      break;
    }
    page++;
  }
  return currentFiles;
}

function hasPendingUploads(files: FigshareFile[]): boolean {
  return files.some(entry => String(entry.status ?? '').toLowerCase() === FIGSHARE_UPLOAD_PENDING_STATUS);
}

async function uploadAttachment(
  client: FigshareClient,
  config: FigsharePublishingConfigData,
  articleId: string,
  oid: string,
  attachment: DataLocationEntry
): Promise<FigshareFile> {
  const fileId = attachment.fileId ?? '';
  const fileName = attachment.name ?? '';
  if (fileId === '' || fileName === '') {
    throw validationError('Attachment entry is missing fileId or name');
  }

  const disk = getStagingDisk(config);
  const stagingKey = buildStagingKey(config, articleId, oid, fileId, fileName);
  const datastream = await getAttachmentStream(oid, fileId);

  let uploadSucceeded = false;

  try {
    const stagedSize = await stageAttachmentToDisk(disk, stagingKey, datastream);
    const uploadInit = await client.createArticleFile(articleId, {
      name: fileName,
      size: stagedSize,
    });
    const uploadDescriptor = await client.getLocation(uploadInit.location);
    const uploadUrl = uploadDescriptor.upload_url;
    const figshareFileId = String(uploadDescriptor.id);
    const partsDescriptor = await client.getLocation(uploadUrl);
    const parts = partsDescriptor.parts ?? [];

    const source = await disk.getStream(stagingKey);
    for await (const { partNo, stream } of readPartsSequentially(source, parts)) {
      await client.uploadFilePart(uploadUrl, partNo, stream);
    }

    await client.completeFileUpload(articleId, figshareFileId, {});
    const uploadedFile = await client.getLocation(uploadInit.location);
    uploadSucceeded = true;
    return uploadedFile as unknown as FigshareFile;
  } finally {
    // Stored configs may omit cleanupPolicy; default to delete-after-success so
    // staged objects are not retained on the staging disk indefinitely.
    const cleanupPolicy = config.assets.staging.cleanupPolicy ?? 'deleteAfterSuccess';
    const shouldDelete = !uploadSucceeded || cleanupPolicy === 'deleteAfterSuccess';
    if (shouldDelete) {
      await disk
        .delete(stagingKey)
        .catch(error => sails.log.warn(`FigService - failed to delete staged object '${stagingKey}'`, error));
    }
  }
}

async function syncLinkOnlyFiles(
  client: FigshareClient,
  articleId: string,
  selectedUrls: DataLocationEntry[],
  currentFiles: FigshareFile[]
): Promise<FigshareFile[]> {
  const existingLinkFiles = currentFiles.filter(entry => entry.is_link_only === true);

  const uploadedUrls: FigshareFile[] = [];
  const creationErrors: Error[] = [];
  for (const entry of selectedUrls) {
    if (entry.ignore === true) {
      continue;
    }
    let responseLocation: { location: string } | null = null;
    let attempt = 0;
    while (attempt < LINK_FILE_CREATE_RETRY_COUNT) {
      attempt += 1;
      try {
        responseLocation = await client.createArticleFile(articleId, {
          link: entry.location ?? '',
        });
        break;
      } catch (error) {
        if (attempt >= LINK_FILE_CREATE_RETRY_COUNT) {
          creationErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
    if (responseLocation != null) {
      try {
        const uploadedFile = await client.getLocation(responseLocation.location);
        uploadedUrls.push({
          id: uploadedFile.id,
          article_id: articleId,
          name: entry.name ?? entry.originalFileName ?? String(entry.location ?? ''),
          status: uploadedFile.status,
          download_url: uploadedFile.download_url,
          is_link_only: true,
        } as FigshareFile);
      } catch (error) {
        creationErrors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  if (creationErrors.length > 0) {
    throw validationError(
      `Failed to create ${creationErrors.length} Figshare link file(s); existing link files were not deleted`
    );
  }

  for (const file of existingLinkFiles) {
    await client.deleteArticleFile(articleId, String(file.id));
  }
  return uploadedUrls;
}

function toFixtureFigshareFile(
  entry: DataLocationEntry,
  articleId: string,
  index: number,
  isLinkOnly: boolean
): FigshareFile {
  const derivedName =
    entry.name ?? entry.originalFileName ?? (isLinkOnly ? `link-${index + 1}` : `attachment-${index + 1}`);
  return {
    id: `fixture-${isLinkOnly ? 'url' : 'attachment'}-${index + 1}`,
    name: derivedName,
    article_id: articleId,
    status: 'available',
    size: 0,
    is_link_only: isLinkOnly,
    download_url: isLinkOnly ? String(entry.location ?? '') : String(entry.download_url ?? ''),
    computed_md5: 'fixture-md5',
  } as FigshareFile;
}

export async function syncAssetsPhase(
  client: FigshareClient,
  config: ResolvedFigsharePublishingConfigData,
  record: RecordModel,
  article: FigshareArticle,
  syncState: FigshareSyncState
): Promise<AssetSyncResult> {
  const selectedDataLocations = getSelectedDataLocations(config, record);
  const selectedAttachments = selectedDataLocations.filter(entry => entry.type === 'attachment');
  const selectedUrls = selectedDataLocations.filter(entry => entry.type === 'url');
  const articleId = String(article.id);

  const attachmentCount = selectedAttachments.length;
  const urlCount = selectedUrls.length;
  const currentFiles = await listArticleFiles(client, articleId);

  if (hasPendingUploads(currentFiles)) {
    throw validationError(`Figshare file uploads are already in progress for article '${articleId}'`);
  }

  if (config.runtime.mode === 'fixture') {
    const uploadsComplete = !(attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete');
    syncState.status =
      attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete'
        ? 'awaiting_upload_completion'
        : 'syncing';
    syncState.partialProgress = {
      articleId,
      attachmentCount,
      urlCount,
      uploadsComplete,
      uploadedAttachmentCount: attachmentCount,
      uploadedUrlCount: urlCount,
    };
    setSyncState(config, record, syncState);
    return {
      articleId,
      attachmentCount,
      urlCount,
      uploadsComplete,
      uploadedAttachments: selectedAttachments.map((entry, index) =>
        toFixtureFigshareFile(entry, articleId, index, false)
      ),
      uploadedUrls: selectedUrls.map((entry, index) => toFixtureFigshareFile(entry, articleId, index, true)),
      dataLocations: selectedDataLocations,
    };
  }

  const oid = getRecordOid(record);
  const uploadedAttachments: FigshareFile[] = [];
  let uploadedAttachmentCountThisRun = 0;
  if (config.assets.enableHostedFiles) {
    for (const attachment of selectedAttachments) {
      const fileName = attachment.name ?? '';
      const alreadyUploaded = currentFiles.find(entry => entry.name === fileName);
      if (alreadyUploaded != null) {
        uploadedAttachments.push(alreadyUploaded);
        continue;
      }
      uploadedAttachments.push(await uploadAttachment(client, config, articleId, oid, attachment));
      uploadedAttachmentCountThisRun += 1;
    }
  }

  const uploadedUrls = config.assets.enableLinkFiles
    ? await syncLinkOnlyFiles(client, articleId, selectedUrls, currentFiles)
    : [];

  const refreshedFiles = attachmentCount > 0 ? await listArticleFiles(client, articleId) : currentFiles;
  const uploadsComplete =
    attachmentCount === 0
      ? true
      : config.article.publishMode === 'afterUploadsComplete' && uploadedAttachmentCountThisRun > 0
        ? false
        : !hasPendingUploads(refreshedFiles);

  syncState.status =
    attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete'
      ? 'awaiting_upload_completion'
      : 'syncing';
  syncState.partialProgress = {
    articleId,
    attachmentCount,
    urlCount,
    uploadsComplete,
    uploadedAttachmentCountThisRun,
    uploadedAttachmentCount: uploadedAttachments.length,
    uploadedUrlCount: uploadedUrls.length,
  };
  setSyncState(config, record, syncState);

  return {
    articleId,
    attachmentCount,
    urlCount,
    uploadsComplete,
    uploadedAttachments,
    uploadedUrls,
    dataLocations: selectedDataLocations,
  };
}
