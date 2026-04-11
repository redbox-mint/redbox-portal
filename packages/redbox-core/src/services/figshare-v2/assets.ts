import fs from 'fs';
import path from 'path';
import checkDiskSpace from 'check-disk-space';
import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { FigshareClient } from './http';
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

function getTempDir(config: FigsharePublishingConfigData): string {
  const configDir = config.assets.staging.tempDir;
  if (configDir) return configDir;
  const sailsDir = (sails.config as Record<string, unknown>).figshareAPI as Record<string, unknown> | undefined;
  return String(sailsDir?.attachmentsFigshareTempDir ?? sailsDir?.attachmentsTempDir ?? '/tmp');
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

async function uploadAttachment(client: FigshareClient, config: FigsharePublishingConfigData, articleId: string, oid: string, attachment: DataLocationEntry): Promise<FigshareFile> {
  const fileId = attachment.fileId ?? '';
  const fileName = attachment.name ?? '';
  if (fileId === '' || fileName === '') {
    throw validationError('Attachment entry is missing fileId or name');
  }

  const tempDir = getTempDir(config);
  const filePath = path.join(tempDir, fileName);
  const datastream = await getAttachmentStream(oid, fileId);
  const expectedSize = Number(datastream.size ?? 0);
  if (expectedSize > 0) {
    const diskSpace = await checkDiskSpace(tempDir);
    if (diskSpace.free < expectedSize + config.assets.staging.diskSpaceThresholdBytes) {
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
    const shouldDeleteTempFile = !uploadSucceeded || config.assets.staging.cleanupPolicy === 'deleteAfterSuccess';
    if (shouldDeleteTempFile && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function syncLinkOnlyFiles(client: FigshareClient, articleId: string, selectedUrls: DataLocationEntry[], currentFiles: FigshareFile[]): Promise<FigshareFile[]> {
  const existingLinkFiles = currentFiles.filter((entry) => entry.is_link_only === true);
  for (const file of existingLinkFiles) {
    await client.deleteArticleFile(articleId, String(file.id));
  }

  const uploadedUrls: FigshareFile[] = [];
  for (const entry of selectedUrls) {
    if (entry.ignore === true) {
      continue;
    }
    const response = await client.createArticleFile(articleId, {
      link: entry.location ?? ''
    });
    uploadedUrls.push(response as unknown as FigshareFile);
  }
  return uploadedUrls;
}

export async function syncAssetsPhase(
  client: FigshareClient,
  config: FigsharePublishingConfigData,
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

  if (currentFiles.some((entry) => String(entry.status ?? '').toLowerCase() === 'created')) {
    throw validationError(`Figshare file uploads are already in progress for article '${articleId}'`);
  }

  if (config.testing.mode === 'fixture') {
    syncState.status = attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete'
      ? 'awaiting_upload_completion'
      : 'syncing';
    syncState.partialProgress = {
      articleId,
      attachmentCount,
      urlCount,
      uploadsComplete: true,
      uploadedAttachmentCount: attachmentCount,
      uploadedUrlCount: urlCount
    };
    setSyncState(config, record, syncState);
    return {
      articleId,
      attachmentCount,
      urlCount,
      uploadsComplete: true,
      uploadedAttachments: selectedAttachments as unknown as FigshareFile[],
      uploadedUrls: selectedUrls as unknown as FigshareFile[],
      dataLocations: selectedDataLocations
    };
  }

  const oid = getRecordOid(record);
  const uploadedAttachments: FigshareFile[] = [];
  if (config.assets.enableHostedFiles) {
    for (const attachment of selectedAttachments) {
      const fileName = attachment.name ?? '';
      const alreadyUploaded = currentFiles.find((entry) => entry.name === fileName);
      if (alreadyUploaded != null) {
        uploadedAttachments.push(alreadyUploaded);
        continue;
      }
      uploadedAttachments.push(await uploadAttachment(client, config, articleId, oid, attachment));
    }
  }

  const uploadedUrls = config.assets.enableLinkFiles
    ? await syncLinkOnlyFiles(client, articleId, selectedUrls, currentFiles)
    : [];

  syncState.status = attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete'
    ? 'awaiting_upload_completion'
    : 'syncing';
  syncState.partialProgress = {
    articleId,
    attachmentCount,
    urlCount,
    uploadsComplete: true,
    uploadedAttachmentCount: uploadedAttachments.length,
    uploadedUrlCount: uploadedUrls.length
  };
  setSyncState(config, record, syncState);

  return {
    articleId,
    attachmentCount,
    urlCount,
    uploadsComplete: true,
    uploadedAttachments,
    uploadedUrls,
    dataLocations: selectedDataLocations
  };
}
