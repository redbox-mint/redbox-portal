import fs from 'fs';
import path from 'path';
import checkDiskSpace from 'check-disk-space';
import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { FigshareClient } from './http';
import { AnyRecord, FigshareSyncState } from './types';
import { setSyncState } from './config';
import { getSelectedDataLocations } from './plan';

function getTempDir(config: FigsharePublishingConfigData): string {
  return String(config.assets.staging.tempDir || _.get(sails.config, 'figshareAPI.attachmentsFigshareTempDir', _.get(sails.config, 'figshareAPI.attachmentsTempDir', '/tmp')));
}

function getRecordOid(record: AnyRecord): string {
  return String(_.get(record, 'redboxOid', _.get(record, 'oid', '')));
}

function getDatastreamService(): AnyRecord {
  const serviceName = String(_.get(sails.config, 'record.datastreamService', ''));
  return (sails.services || {})[serviceName] as AnyRecord;
}

function validationError(message: string): RBValidationError {
  return new RBValidationError({
    message,
    displayErrors: [{ title: message, detail: message }]
  });
}

async function getAttachmentStream(oid: string, fileId: string): Promise<AnyRecord> {
  const datastreamService = getDatastreamService();
  if (datastreamService == null) {
    throw new Error('Datastream service is not configured');
  }

  const response = await (datastreamService.getDatastream as any)(oid, fileId);
  const readStream = response?.readstream;
  if (readStream == null) {
    throw new Error(`Unable to read datastream '${fileId}' for record '${oid}'`);
  }
  return response;
}

async function stageAttachmentToDisk(response: AnyRecord, filePath: string): Promise<number> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const readStream = response.readstream as NodeJS.ReadableStream;
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

async function uploadAttachment(client: FigshareClient, config: FigsharePublishingConfigData, articleId: string, oid: string, attachment: AnyRecord): Promise<AnyRecord> {
  const fileId = String(_.get(attachment, 'fileId', ''));
  const fileName = String(_.get(attachment, 'name', ''));
  if (fileId === '' || fileName === '') {
    throw validationError('Attachment entry is missing fileId or name');
  }

  const tempDir = getTempDir(config);
  const filePath = path.join(tempDir, fileName);
  const datastream = await getAttachmentStream(oid, fileId);
  const expectedSize = _.toNumber(_.get(datastream, 'size', 0));
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
    const uploadDescriptor = await client.getLocation(String(_.get(uploadInit, 'location', '')));
    const uploadUrl = String(_.get(uploadDescriptor, 'upload_url', ''));
    const figshareFileId = String(_.get(uploadDescriptor, 'id', ''));
    const partsDescriptor = await client.getLocation(uploadUrl);
    const parts = (_.get(partsDescriptor, 'parts', []) as AnyRecord[]) || [];

    for (const part of parts) {
      const readStream = fs.createReadStream(filePath, {
        start: _.toNumber(_.get(part, 'startOffset', 0)),
        end: _.toNumber(_.get(part, 'endOffset', 0))
      });
      await client.uploadFilePart(uploadUrl, _.toNumber(_.get(part, 'partNo', 0)), readStream);
    }

    await client.completeFileUpload(articleId, figshareFileId, {});
    const uploadedFile = await client.getLocation(String(_.get(uploadInit, 'location', '')));
    uploadSucceeded = true;
    return uploadedFile;
  } finally {
    const shouldDeleteTempFile = !uploadSucceeded || config.assets.staging.cleanupPolicy === 'deleteAfterSuccess';
    if (shouldDeleteTempFile && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function syncLinkOnlyFiles(client: FigshareClient, articleId: string, selectedUrls: AnyRecord[], currentFiles: AnyRecord[]): Promise<AnyRecord[]> {
  const existingLinkFiles = currentFiles.filter((entry: AnyRecord) => _.get(entry, 'is_link_only', false) === true);
  for (const file of existingLinkFiles) {
    await client.deleteArticleFile(articleId, String(_.get(file, 'id', '')));
  }

  const uploadedUrls: AnyRecord[] = [];
  for (const entry of selectedUrls) {
    if (_.get(entry, 'ignore', false) === true) {
      continue;
    }
    const response = await client.createArticleFile(articleId, {
      link: _.get(entry, 'location', '')
    });
    uploadedUrls.push(response);
  }
  return uploadedUrls;
}

export async function syncAssetsPhase(
  client: FigshareClient,
  config: FigsharePublishingConfigData,
  record: AnyRecord,
  article: AnyRecord,
  syncState: FigshareSyncState
): Promise<AnyRecord> {
  const selectedDataLocations = getSelectedDataLocations(config, record);
  const selectedAttachments = selectedDataLocations.filter((entry) => entry.type === 'attachment');
  const selectedUrls = selectedDataLocations.filter((entry) => entry.type === 'url');
  const articleId = String(_.get(article, 'id', ''));

  const attachmentCount = selectedAttachments.length;
  const urlCount = selectedUrls.length;
  const currentFiles: AnyRecord[] = [];
  let page = 1;
  const pageSize = 20;
  while (true) {
    const pageResults = await client.listArticleFiles(articleId, page, pageSize);
    if (!_.isArray(pageResults) || pageResults.length === 0) {
      break;
    }
    currentFiles.push(...pageResults);
    if (pageResults.length < pageSize) {
      break;
    }
    page++;
  }

  if (currentFiles.some((entry: AnyRecord) => String(_.get(entry, 'status', '')).toLowerCase() === 'created')) {
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
      uploadedAttachments: selectedAttachments,
      uploadedUrls: selectedUrls,
      dataLocations: selectedDataLocations
    };
  }

  const oid = getRecordOid(record);
  const uploadedAttachments: AnyRecord[] = [];
  if (config.assets.enableHostedFiles) {
    for (const attachment of selectedAttachments) {
      const fileName = String(_.get(attachment, 'name', ''));
      const alreadyUploaded = currentFiles.find((entry: AnyRecord) => String(_.get(entry, 'name', '')) === fileName);
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
