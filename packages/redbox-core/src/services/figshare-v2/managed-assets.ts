import { createHash } from 'node:crypto';
import type { FigshareSyncModel } from '../../model/storage/FigshareSyncModel';
import type { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import type { FigshareClient } from './http';
import type { RecordModel, DataLocationEntry, FigshareArticle } from './types';
import { getRecordField } from './types';
import { getSelectedDataLocations } from './plan';
import { getAttachmentStream, getStagingDisk, buildStagingKey, stageAttachmentToDisk, readPartsSequentially } from './assets';
import { listArticleFiles } from './runtime';
import { FigshareRepairRequired, FigshareWaiting } from './execution';
import { observedPublished } from './identity';

export type AssetCheckpoint = (change: (state: FigshareSyncModel) => void) => Promise<FigshareSyncModel>;
const available = (status: unknown): boolean => ['available', 'completed'].includes(String(status ?? '').toLowerCase());

/** Only receipts confer deletion authority; a filename never does. */
export async function mirrorManagedAssets(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel, articleId: string, state: FigshareSyncModel, checkpoint: AssetCheckpoint): Promise<void> {
  const selected = getSelectedDataLocations(config, record);
  const hosted = selected.filter(e => e.type === 'attachment' || typeof e.figshareReceipt === 'string');
  const links = hosted.length ? [] : selected.filter(e => e.type === 'url' && !e.ignore && !e.figshareReceipt);
  const desired = new Set<string>();
  let files = await listArticleFiles(client, articleId);
  for (const entry of hosted) {
    if (!config.assets.enableHostedFiles) continue;
    if (typeof entry.figshareReceipt === 'string') {
      const receipt = state.receipts.find(r => r.key === entry.figshareReceipt && r.articleId === articleId && r.state === 'available');
      if (!receipt || !files.some(f => String(f.id) === receipt.fileId && available(f.status))) throw new FigshareRepairRequired('Hosted file reference has no verified receipt');
      desired.add(receipt.key);
      continue;
    }
    const localId = String(entry.fileId ?? '');
    const name = String(entry.name ?? '');
    if (!localId || !name) throw new Error('Selected attachment is missing its ID or name');
    const disk = getStagingDisk(config);
    const stagingKey = buildStagingKey(config, articleId, record.redboxOid, localId, name);
    try {
      const size = await stageAttachmentToDisk(disk, stagingKey, await getAttachmentStream(record.redboxOid, localId));
      const hash = createHash('sha256');
      const md5Hash = createHash('md5');
      for await (const chunk of await disk.getStream(stagingKey)) { hash.update(chunk); md5Hash.update(chunk); }
      const md5 = md5Hash.digest('hex');
      const digest = hash.digest('hex');
      const key = createHash('sha256').update(`${localId}:${digest}:${size}`).digest('hex');
      desired.add(key);
      let receipt = state.receipts.find(r => r.key === key);
      if (receipt?.state === 'removed') receipt = undefined;
      let resumeFileId: string | undefined;
      if (receipt) {
        const remote = files.find(f => String(f.id) === receipt!.fileId);
        if (remote && available(remote.status) && Number(remote.size) === size) {
          const verified = receipt;
          state = await checkpoint(s => {
            const target = s.receipts.find(r => r.key === verified.key)!;
            target.state = 'available'; target.completedAt = new Date().toISOString(); target.downloadUrl = remote.download_url; target.desired = true;
          });
          continue;
        }
        // Only an explicit operator decision, made after stopping the old uploader,
        // permits resuming an interrupted multipart upload.
        if (receipt.resumeApproved && receipt.fileId && receipt.state === 'uploading' && remote) resumeFileId = receipt.fileId;
        else {
          if (['initialising', 'uploading'].includes(receipt.state)) throw new FigshareRepairRequired('Interrupted upload requires reconciliation before another initialisation');
          if (receipt.state === 'completing' && remote) throw new FigshareWaiting('uploads');
          throw new FigshareRepairRequired('Managed remote file is missing or no longer matches its receipt');
        }
      }
      let location: string;
      if (resumeFileId) {
        location = `${config.connection.baseUrl.replace(/\/+$/, '')}/account/articles/${articleId}/files/${resumeFileId}`;
        state = await checkpoint(s => { s.receipts.find(r => r.key === key)!.resumeApproved = false; });
      } else {
        receipt = { key, localId, digest, md5, size, name, articleId, kind: 'hosted', state: 'initialising', desired: true };
        const created = receipt;
        state = await checkpoint(s => { s.receipts = s.receipts.filter(r => r.key !== key); s.receipts.push(created); });
        const init = await client.createArticleFile(articleId, { name, size, md5 });
        const remoteId = String(init.entity_id ?? init.id ?? /\/files\/(\d+)(?:$|\?)/.exec(init.location)?.[1] ?? '');
        if (remoteId) state = await checkpoint(s => { s.receipts.find(r => r.key === key)!.fileId = remoteId; });
        location = init.location;
      }
      const descriptor = await client.getLocation(location);
      const fileId = String(descriptor.id);
      state = await checkpoint(s => { Object.assign(s.receipts.find(r => r.key === key)!, { fileId, state: 'uploading' }); });
      const parts = (await client.getLocation(descriptor.upload_url)).parts ?? [];
      const source = await disk.getStream(stagingKey);
      try {
        for await (const part of readPartsSequentially(source, parts)) {
          if (resumeFileId && ['COMPLETE', 'COMPLETED'].includes(String(parts.find(p => p.partNo === part.partNo)?.status).toUpperCase())) {
            for await (const _chunk of part.stream) { /* advance through the confirmed part */ }
          } else await client.uploadFilePart(descriptor.upload_url, part.partNo, part.stream);
        }
      } finally { source.destroy(); }
      state = await checkpoint(s => { s.receipts.find(r => r.key === key)!.state = 'completing'; });
      await client.completeFileUpload(articleId, fileId);
      files = await listArticleFiles(client, articleId);
      const remote = files.find(f => String(f.id) === fileId);
      if (!remote || !available(remote.status)) throw new FigshareWaiting('uploads');
      if (Number(remote.size) !== size) throw new FigshareRepairRequired('Uploaded file size does not match staged content');
      state = await checkpoint(s => { Object.assign(s.receipts.find(r => r.key === key)!, { state: 'available', completedAt: new Date().toISOString(), downloadUrl: remote.download_url }); });
    } finally {
      // Only temporary staging objects are removed. Source attachment bytes remain.
      await disk.delete(stagingKey);
    }
  }
  for (const entry of links) {
    if (!config.assets.enableLinkFiles) continue;
    const link = String(entry.location ?? '');
    if (!/^https?:\/\//i.test(link)) throw new Error('Selected Figshare link must use HTTP or HTTPS');
    const key = createHash('sha256').update(`link:${link}`).digest('hex');
    desired.add(key);
    const receipt = state.receipts.find(r => r.key === key && r.state !== 'removed');
    if (receipt) {
      if (!receipt.fileId || !files.some(f => String(f.id) === receipt.fileId)) throw new FigshareRepairRequired('Uncertain linked file initialisation requires repair');
      continue;
    }
    state = await checkpoint(s => {
      s.receipts = s.receipts.filter(r => r.key !== key);
      s.receipts.push({ key, localId: link, digest: key, size: 0, name: link, articleId, link, kind: 'link', state: 'initialising', desired: true });
    });
    const init = await client.createArticleFile(articleId, { link });
    const fileId = String(init.entity_id ?? init.id ?? /\/files\/(\d+)(?:$|\?)/.exec(init.location)?.[1] ?? '');
    if (!fileId) throw new FigshareRepairRequired('Linked file response did not identify the created file');
    state = await checkpoint(s => { Object.assign(s.receipts.find(r => r.key === key)!, { fileId, state: 'available', completedAt: new Date().toISOString() }); });
  }
  for (const receipt of state.receipts) {
    if (desired.has(receipt.key) || receipt.state === 'removed') continue;
    if (!receipt.fileId || !['available', 'deleting'].includes(receipt.state)) throw new FigshareRepairRequired('Unresolved managed upload cannot be deleted');
    state = await checkpoint(s => { Object.assign(s.receipts.find(r => r.key === receipt.key)!, { desired: false, state: 'deleting' }); });
    if (files.some(f => String(f.id) === receipt.fileId)) await client.deleteArticleFile(articleId, receipt.fileId);
    state = await checkpoint(s => { s.receipts.find(r => r.key === receipt.key)!.state = 'removed'; });
  }
  state = await checkpoint(s => {
    for (const receipt of s.receipts) receipt.desired = desired.has(receipt.key);
    s.checkpoints.assets = createHash('sha256').update([...desired].sort().join(':')).digest('hex');
  });
}

export async function cleanupProjection(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel, article: FigshareArticle, state: FigshareSyncModel): Promise<DataLocationEntry[]> {
  if (!observedPublished(article) || article.is_embargoed === true || !client.getPublicArticle) throw new FigshareWaiting('replacement_access');
  const publicArticle = await client.getPublicArticle(String(article.id));
  const publicFiles = Array.isArray(publicArticle.files) ? publicArticle.files as Array<Record<string, unknown>> : [];
  const entries = (getRecordField(record, config.record.dataLocationsPath) ?? []) as DataLocationEntry[];
  let pending = false;
  const replacements: DataLocationEntry[] = [];
  for (const entry of entries) {
    if (entry.type !== 'attachment') { replacements.push(entry); continue; }
    const receipt = state.receipts.find(r => r.localId === entry.fileId && r.articleId === String(article.id) && r.desired && r.state === 'available');
    if (!receipt) { replacements.push(entry); continue; } // Unmanaged/unselected local attachments are retained.
    const remote = publicFiles.find(f => String(f.id) === receipt.fileId && Number(f.size) === receipt.size);
    if (!remote || typeof remote.download_url !== 'string' || !/^https?:\/\//.test(remote.download_url)) { pending = true; replacements.push(entry); continue; }
    const source = await getAttachmentStream(record.redboxOid, String(entry.fileId));
    const digest = createHash('sha256');
    for await (const chunk of source.readstream as import('node:stream').Readable) digest.update(chunk);
    if (digest.digest('hex') !== receipt.digest) throw new FigshareWaiting('newer_sync');
    replacements.push({ ...entry, type: 'url', location: remote.download_url, originalFileName: receipt.name, ignore: true,
      figshareReceipt: receipt.key, localBytesRetained: true });
  }
  if (pending) throw new FigshareWaiting('replacement_access');
  return replacements;
}
