import fs from 'fs';
import path from 'path';
import checkDiskSpace from 'check-disk-space';
import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { FigshareClient } from './http';
import { ResolvedFigsharePublishingConfigData } from './config';
import {
  RecordModel,
  FigshareArticle,
  FigshareFile,
  FigshareSyncState,
  DataLocationEntry,
  AssetSyncResult,
} from './types';
import { setSyncState } from './config';
import { getSelectedDataLocations } from './plan';

const UNKNOWN_SIZE_STAGING_BUFFER_BYTES = 50 * 1024 * 1024;
const LINK_FILE_CREATE_RETRY_COUNT = 3;
const FIGSHARE_UPLOAD_PENDING_STATUS = 'created';

function getTempDir(config: FigsharePublishingConfigData): string {
  const configDir = config.assets.staging.tempDir;
  if (configDir) return configDir;
  return '/tmp';
}

function getRecordOid(record: RecordModel): string {
  return record.redboxOid ?? record.id ?? '';
}

function getDatastreamService(): Record<string, unknown> | undefined {
  const recordConfig = (sails.config as Record<string, unknown>).record as Record<string, unknown> | undefined;
  const serviceName = String(recordConfig?.datastreamService ?? '');
  return serviceName ? (sails.services as Record<string, unknown>)?.[serviceName] as Record<string, unknown> | undefined : undefined;
}

function validationError(message: string): RBValidationError {
  return new RBValidationError({
    message,
    displayErrors: [{ title: message, detail: message }]
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

  const response = await (datastreamService.getDatastream as (oid: string, fileId: string) => Promise<DatastreamResponse>)(oid, fileId);
  if (response?.readstream == null) {
    throw new Error(`Unable to read datastream '${fileId}' for record '${oid}'`);
  }
  return response;
}

async function stageAttachmentToDisk(response: DatastreamResponse, filePath: string): Promise<number> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const readStream = response.readstream;
  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('close', () => resolve());
    readStream.pipe(writeStream);
  });

  const stat = await fs.promises.stat(filePath);
  return stat.size;
}

function sanitizePathComponent(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
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
  return files.some((entry) => String(entry.status ?? '').toLowerCase() === FIGSHARE_UPLOAD_PENDING_STATUS);
}

async function uploadAttachment(client: FigshareClient, config: FigsharePublishingConfigData, articleId: string, oid: string, attachment: DataLocationEntry): Promise<FigshareFile> {
  const fileId = attachment.fileId ?? '';
  const fileName = attachment.name ?? '';
  if (fileId === '' || fileName === '') {
    throw validationError('Attachment entry is missing fileId or name');
  }

  const tempDir = getTempDir(config);
  const resolvedTempDir = path.resolve(tempDir);
  const safeFileName = path.basename(fileName).trim();
  if (safeFileName === '') {
    throw validationError(`Attachment '${fileName}' does not contain a valid file name`);
  }
  await fs.promises.mkdir(resolvedTempDir, { recursive: true });
  const stagingDir = await fs.promises.mkdtemp(path.join(
    resolvedTempDir,
    `${sanitizePathComponent(articleId)}-${sanitizePathComponent(oid)}-${sanitizePathComponent(fileId)}-`
  ));
  const filePath = path.resolve(stagingDir, safeFileName);
  if (!filePath.startsWith(`${stagingDir}${path.sep}`) && filePath !== path.join(stagingDir, safeFileName)) {
    throw validationError(`Attachment '${fileName}' resolves outside the staging directory`);
  }
  const datastream = await getAttachmentStream(oid, fileId);
  const expectedSize = Number(datastream.size ?? 0);
  if (expectedSize > 0) {
    const diskSpace = await checkDiskSpace(tempDir);
    if (diskSpace.free < expectedSize + config.assets.staging.diskSpaceThresholdBytes) {
      throw validationError(`Not enough free disk space to upload '${fileName}'`);
    }
  } else {
    const diskSpace = await checkDiskSpace(tempDir);
    const requiredBytes = config.assets.staging.diskSpaceThresholdBytes + UNKNOWN_SIZE_STAGING_BUFFER_BYTES;
    if (diskSpace.free < requiredBytes) {
      throw validationError(`Not enough free disk space to upload '${fileName}'`);
    }
  }

  let uploadSucceeded = false;

  try {
    const stagedSize = await stageAttachmentToDisk(datastream, filePath);
    if (expectedSize <= 0) {
      const diskSpace = await checkDiskSpace(tempDir);
      if (diskSpace.free < stagedSize + config.assets.staging.diskSpaceThresholdBytes) {
        throw validationError(`Not enough free disk space to upload '${fileName}'`);
      }
    }

    const uploadInit = await client.createArticleFile(articleId, {
      name: fileName,
      size: stagedSize
    });
    const uploadDescriptor = await client.getLocation(uploadInit.location);
    const uploadUrl = uploadDescriptor.upload_url;
    const figshareFileId = String(uploadDescriptor.id);
    const partsDescriptor = await client.getLocation(uploadUrl);
    const parts = partsDescriptor.parts ?? [];

    for (const part of parts) {
      const readStream = fs.createReadStream(filePath, {
        start: part.startOffset,
        end: part.endOffset
      });
      await client.uploadFilePart(uploadUrl, part.partNo, readStream);
    }

    await client.completeFileUpload(articleId, figshareFileId, {});
    const uploadedFile = await client.getLocation(uploadInit.location);
    uploadSucceeded = true;
    return uploadedFile as unknown as FigshareFile;
  } finally {
    const shouldDeleteStagingDir = !uploadSucceeded || config.assets.staging.cleanupPolicy === 'deleteAfterSuccess';
    if (shouldDeleteStagingDir && fs.existsSync(stagingDir)) {
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
    }
  }
}

async function syncLinkOnlyFiles(client: FigshareClient, articleId: string, selectedUrls: DataLocationEntry[], currentFiles: FigshareFile[]): Promise<FigshareFile[]> {
  const existingLinkFiles = currentFiles.filter((entry) => entry.is_link_only === true);

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
          link: entry.location ?? ''
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
          is_link_only: true
        } as FigshareFile);
      } catch (error) {
        creationErrors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  if (creationErrors.length > 0) {
    throw validationError(`Failed to create ${creationErrors.length} Figshare link file(s); existing link files were not deleted`);
  }

  for (const file of existingLinkFiles) {
    await client.deleteArticleFile(articleId, String(file.id));
  }
  return uploadedUrls;
}

function toFixtureFigshareFile(entry: DataLocationEntry, articleId: string, index: number, isLinkOnly: boolean): FigshareFile {
  const derivedName = entry.name ?? entry.originalFileName ?? (isLinkOnly ? `link-${index + 1}` : `attachment-${index + 1}`);
  return {
    id: `fixture-${isLinkOnly ? 'url' : 'attachment'}-${index + 1}`,
    name: derivedName,
    article_id: articleId,
    status: 'available',
    size: 0,
    is_link_only: isLinkOnly,
    download_url: isLinkOnly ? String(entry.location ?? '') : String(entry.download_url ?? ''),
    computed_md5: 'fixture-md5'
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
  const selectedAttachments = selectedDataLocations.filter((entry) => entry.type === 'attachment');
  const selectedUrls = selectedDataLocations.filter((entry) => entry.type === 'url');
  const articleId = String(article.id);

  const attachmentCount = selectedAttachments.length;
  const urlCount = selectedUrls.length;
  const currentFiles = await listArticleFiles(client, articleId);

  if (hasPendingUploads(currentFiles)) {
    throw validationError(`Figshare file uploads are already in progress for article '${articleId}'`);
  }

  if (config.runtime.mode === 'fixture') {
    const uploadsComplete = !(attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete');
    syncState.status = attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete'
      ? 'awaiting_upload_completion'
      : 'syncing';
    syncState.partialProgress = {
      articleId,
      attachmentCount,
      urlCount,
      uploadsComplete,
      uploadedAttachmentCount: attachmentCount,
      uploadedUrlCount: urlCount
    };
    setSyncState(config, record, syncState);
    return {
      articleId,
      attachmentCount,
      urlCount,
      uploadsComplete,
      uploadedAttachments: selectedAttachments.map((entry, index) => toFixtureFigshareFile(entry, articleId, index, false)),
      uploadedUrls: selectedUrls.map((entry, index) => toFixtureFigshareFile(entry, articleId, index, true)),
      dataLocations: selectedDataLocations
    };
  }

  const oid = getRecordOid(record);
  const uploadedAttachments: FigshareFile[] = [];
  let uploadedAttachmentCountThisRun = 0;
  if (config.assets.enableHostedFiles) {
    for (const attachment of selectedAttachments) {
      const fileName = attachment.name ?? '';
      const alreadyUploaded = currentFiles.find((entry) => entry.name === fileName);
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
  const uploadsComplete = attachmentCount === 0
    ? true
    : config.article.publishMode === 'afterUploadsComplete' && uploadedAttachmentCountThisRun > 0
      ? false
      : !hasPendingUploads(refreshedFiles);

  syncState.status = attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete'
    ? 'awaiting_upload_completion'
    : 'syncing';
  syncState.partialProgress = {
    articleId,
    attachmentCount,
    urlCount,
    uploadsComplete,
    uploadedAttachmentCountThisRun,
    uploadedAttachmentCount: uploadedAttachments.length,
    uploadedUrlCount: uploadedUrls.length
  };
  setSyncState(config, record, syncState);

  return {
    articleId,
    attachmentCount,
    urlCount,
    uploadsComplete,
    uploadedAttachments,
    uploadedUrls,
    dataLocations: selectedDataLocations
  };
}
