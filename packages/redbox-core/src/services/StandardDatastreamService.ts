import { Services as services } from '../CoreService';
import { DatastreamRequestContext, DatastreamService } from '../DatastreamService';
import { DatastreamServiceResponse } from '../DatastreamServiceResponse';
import { Datastream } from '../Datastream';
import { Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import * as _ from 'lodash';
import { Readable } from 'node:stream';
import type { Services as StorageManagerServices } from './StorageManagerService';
import type { AttachmentMetadataAttributes } from '../waterline-models';
import type { Services as AttachmentMetadataServices } from './AttachmentMetadataService';

type IDisk = StorageManagerServices.IDisk;
type AttachmentAccessAction = 'access' | 'download' | 'list' | 'upload' | 'remove';
type AttachmentMetadataInput = AttachmentMetadataServices.AttachmentMetadataInput;
type AttachmentMetadataServiceContract = {
  upsert: (row: AttachmentMetadataInput) => Promise<void>;
  findByOid: (oid: string) => Promise<AttachmentMetadataAttributes[]>;
  findOneByStorageKey: (storageKey: string) => Promise<AttachmentMetadataAttributes | undefined>;
  deleteByStorageKey: (storageKey: string) => Promise<void>;
  recordAccess: (event: {
    oid: string;
    fileId?: string;
    storageKey?: string;
    action: AttachmentAccessAction;
    accessedBy?: string;
    itemCount?: number;
  }) => Promise<void>;
};

type RecordWithMetadata = {
  metaMetadata: { form: string; brandId?: string; attachmentFields?: string[] };
  metadata: Record<string, unknown>;
};

/**
 * StandardDatastreamService
 *
 * Implements the DatastreamService interface using Flydrive v2 disks
 * managed by StorageManagerService. Files are read from the staging disk
 * and written to the primary disk under the configured key prefix.
 */
export namespace Services {
  export class StandardDatastream extends services.Core.Service implements DatastreamService {
    private static promotionGuards: Map<string, Promise<boolean>> = new Map();

    protected override _exportedMethods: string[] = [
      'addDatastreams',
      'updateDatastream',
      'removeDatastream',
      'addDatastream',
      'addAndRemoveDatastreams',
      'getDatastream',
      'listDatastreams',
    ];

    protected override logHeader: string = 'StandardDatastreamService::';

    /**
     * Build the storage key for a file under the configured prefix.
     */
    private normalizedKeyPrefix(): string {
      const storageConfig = StorageManagerService.getMergedStorageConfig();
      const keyPrefix = storageConfig.keyPrefix ?? '';
      if (_.isEmpty(keyPrefix)) {
        return '';
      }
      return `${keyPrefix.replace(/\/+$/, '')}/`;
    }

    /**
     * Build the storage key for a file under the configured prefix.
     */
    private storageKey(oid: string, fileId: string): string {
      return `${this.normalizedKeyPrefix()}${oid}/${fileId}`;
    }

    private fileIdFromStorageKey(key: string): string {
      return key.split('/').filter(Boolean).pop() ?? key;
    }

    private attachmentMetadataService(): AttachmentMetadataServiceContract | undefined {
      return sails.services.attachmentmetadataservice as AttachmentMetadataServiceContract | undefined;
    }

    private requestUsername(requestContext?: DatastreamRequestContext): string | undefined {
      const username = String(requestContext?.username ?? '').trim();
      return username || undefined;
    }

    private safeToISOString(value: unknown): string | undefined {
      if (value === null || value === undefined) {
        return undefined;
      }

      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
      }

      const valueWithToISOString = value as { toISOString?: () => string };
      if (typeof valueWithToISOString.toISOString === 'function') {
        try {
          return valueWithToISOString.toISOString();
        } catch {
          return undefined;
        }
      }

      const normalizedDate = new Date(value as string | number | Date);
      return Number.isNaN(normalizedDate.getTime()) ? undefined : normalizedDate.toISOString();
    }

    private metadataToListEntry(row: AttachmentMetadataAttributes): Record<string, unknown> {
      const normalizedLastModified = row.lastModified
        ? new Date(row.lastModified as string | number | Date)
        : undefined;
      return this.datastreamListEntry(row.storageKey, {
        contentType: row.contentType,
        contentLength: row.contentLength,
        lastModified: normalizedLastModified && !Number.isNaN(normalizedLastModified.getTime()) ? normalizedLastModified : row.lastModified,
        etag: row.etag,
        metadata: {
          fileId: row.fileId,
          name: row.filename ?? row.fileId,
          mimeType: row.mimeType ?? row.contentType,
          filename: row.filename,
          uploadedBy: row.uploadedBy,
          attachmentField: row.attachmentField,
          lastAccessedAt: row.lastAccessedAt,
          lastAccessedBy: row.lastAccessedBy,
          accessCount: row.accessCount,
        },
      });
    }

    private async buildMetadataRow(
      oid: string,
      fileId: string,
      storageKey: string,
      metadata?: Record<string, unknown>
    ): Promise<AttachmentMetadataInput> {
      const primaryDisk = StorageManagerService.primaryDisk();
      const diskMetadata = await primaryDisk.getMetaData(storageKey);
      return {
        oid,
        fileId,
        storageKey,
        contentType: diskMetadata.contentType,
        contentLength: diskMetadata.contentLength,
        etag: diskMetadata.etag,
        lastModified: this.safeToISOString(diskMetadata.lastModified),
        filename: typeof metadata?.name === 'string' ? metadata.name : undefined,
        mimeType: typeof metadata?.mimeType === 'string' ? metadata.mimeType : diskMetadata.contentType,
        uploadedBy: typeof metadata?.uploadedBy === 'string' ? metadata.uploadedBy : undefined,
        attachmentField: typeof metadata?.attachmentField === 'string' ? metadata.attachmentField : undefined,
      };
    }

    private async safelyUpsertMetadata(row: AttachmentMetadataInput): Promise<void> {
      const metadataService = this.attachmentMetadataService();
      if (!metadataService) {
        return;
      }
      try {
        await metadataService.upsert(row);
      } catch (err) {
        this.logger.error(`${this.logHeader} metadata upsert failed for ${row.storageKey}`, err);
      }
    }

    private async safelyDeleteMetadata(storageKey: string): Promise<void> {
      const metadataService = this.attachmentMetadataService();
      if (!metadataService) {
        return;
      }
      try {
        await metadataService.deleteByStorageKey(storageKey);
      } catch (err) {
        this.logger.error(`${this.logHeader} metadata delete failed for ${storageKey}`, err);
      }
    }

    private async safelyRecordAccess(event: {
      oid: string;
      fileId?: string;
      storageKey?: string;
      action: AttachmentAccessAction;
      accessedBy?: string;
      itemCount?: number;
    }): Promise<void> {
      const metadataService = this.attachmentMetadataService();
      if (!metadataService) {
        return;
      }
      try {
        await metadataService.recordAccess(event);
      } catch (err) {
        this.logger.error(`${this.logHeader} access audit failed for ${event.action} ${event.storageKey ?? event.oid}`, err);
      }
    }

    private async backfillMetadataFromDisk(
      oid: string,
      fileEntries: Array<{ key: string; fileObj: Record<string, unknown> }>
    ): Promise<Record<string, { row: AttachmentMetadataInput; details: Record<string, unknown> }>> {
      const primaryDisk = StorageManagerService.primaryDisk();
      const results: PromiseSettledResult<AttachmentMetadataInput>[] = [];
      const detailsByKey: Record<string, Record<string, unknown>> = {};
      const metadataBatchSize = 10;
      for (let index = 0; index < fileEntries.length; index += metadataBatchSize) {
        const batch = fileEntries.slice(index, index + metadataBatchSize);
        const batchResults = await Promise.allSettled(batch.map(async ({ key }) => {
          const meta = await primaryDisk.getMetaData(key);
          const fileId = this.fileIdFromStorageKey(key);
          const row: AttachmentMetadataInput = {
            oid,
            fileId,
            storageKey: key,
            contentType: meta.contentType,
            contentLength: meta.contentLength,
            etag: meta.etag,
            lastModified: this.safeToISOString(meta.lastModified),
          };
          detailsByKey[key] = {
            contentType: meta.contentType,
            contentLength: meta.contentLength,
            etag: meta.etag,
            lastModified: meta.lastModified,
          };
          await this.safelyUpsertMetadata(row);
          return row;
        }));
        results.push(...batchResults);
      }

      const byKey: Record<string, { row: AttachmentMetadataInput; details: Record<string, unknown> }> = {};
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          byKey[result.value.storageKey] = {
            row: result.value,
            details: detailsByKey[result.value.storageKey] ?? {},
          };
        }
      });
      return byKey;
    }

    private datastreamListEntry(key: string, details: Record<string, unknown> = {}): Record<string, unknown> {
      const fileId = this.fileIdFromStorageKey(key);
      return {
        filename: key,
        ...details,
        metadata: {
          fileId,
          name: fileId,
          ...((details['metadata'] as Record<string, unknown> | undefined) ?? {}),
        },
      };
    }

    private isStorageNotFoundError(err: unknown): boolean {
      if (!err || typeof err !== 'object') {
        return false;
      }

      const storageError = err as {
        code?: string;
        status?: number;
        statusCode?: number;
        message?: string;
      };
      const message = storageError.message?.toLowerCase() ?? '';

      return storageError.code === 'ENOENT'
        || storageError.code === 'NoSuchKey'
        || storageError.status === 404
        || storageError.statusCode === 404
        || message.includes('not found')
        || message.includes('no such')
        || message.includes('does not exist')
        || message.includes('enoent');
    }

    private isStorageAlreadyExistsError(err: unknown): boolean {
      if (!err || typeof err !== 'object') {
        return false;
      }

      const storageError = err as {
        code?: string;
        status?: number;
        statusCode?: number;
        message?: string;
      };
      const message = storageError.message?.toLowerCase() ?? '';

      return storageError.code === 'EEXIST'
        || storageError.status === 409
        || storageError.statusCode === 409
        || message.includes('already exists')
        || message.includes('eexist');
    }

    private async promoteFromStagingOnce(oid: string, fileId: string, destKey: string): Promise<boolean> {
      const inFlightPromotion = Services.StandardDatastream.promotionGuards.get(destKey);
      if (inFlightPromotion) {
        return inFlightPromotion;
      }

      const promotionPromise = this.promoteFromStaging(oid, fileId, destKey);
      Services.StandardDatastream.promotionGuards.set(destKey, promotionPromise);

      try {
        return await promotionPromise;
      } finally {
        if (Services.StandardDatastream.promotionGuards.get(destKey) === promotionPromise) {
          Services.StandardDatastream.promotionGuards.delete(destKey);
        }
      }
    }

    private async promoteFromStaging(oid: string, fileId: string, destKey: string): Promise<boolean> {
      const stagingDisk = StorageManagerService.stagingDisk();
      const primaryDisk = StorageManagerService.primaryDisk();

      if (await primaryDisk.exists(destKey)) {
        this.logger.verbose(`${this.logHeader} promoteFromStaging() -> Already present: ${destKey}`);
        return true;
      }

      const existsInStaging = await stagingDisk.exists(fileId);
      if (!existsInStaging) {
        return await this.promoteTusPartsFromStaging(stagingDisk, primaryDisk, fileId, destKey)
          || primaryDisk.exists(destKey);
      }

      const readable = await stagingDisk.getStream(fileId);

      try {
        await primaryDisk.putStream(destKey, readable);
      } catch (err) {
        readable.destroy();
        if (!this.isStorageAlreadyExistsError(err) || !(await primaryDisk.exists(destKey))) {
          throw err;
        }
      }

      try {
        await stagingDisk.delete(fileId);
      } catch (err) {
        if (!this.isStorageNotFoundError(err)) {
          throw err;
        }
      }

      this.logger.verbose(`${this.logHeader} promoteFromStaging() -> Promoted: ${destKey}`);
      if (oid) {
        try {
          const metadataRow = await this.buildMetadataRow(oid, fileId, destKey);
          await this.safelyUpsertMetadata(metadataRow);
        } catch (err) {
          this.logger.error(`${this.logHeader} promoteFromStaging() metadata sync failed for ${destKey}`, err);
        }
        await this.safelyRecordAccess({ oid, fileId, storageKey: destKey, action: 'upload' });
      }
      return true;
    }

    private async promoteTusPartsFromStaging(
      stagingDisk: IDisk,
      primaryDisk: IDisk,
      fileId: string,
      destKey: string
    ): Promise<boolean> {
      const partKeys = await this.listTusPartKeys(stagingDisk, fileId);
      if (!partKeys.length) {
        return false;
      }

      const readable = Readable.from(this.streamDiskObjects(stagingDisk, partKeys));
      try {
        await primaryDisk.putStream(destKey, readable);
        await stagingDisk.deleteAll(this.tusPartsPrefix(fileId));
        await stagingDisk.delete(this.tusInfoKey(fileId)).catch((err) => {
          if (!this.isStorageNotFoundError(err)) {
            throw err;
          }
        });
      } catch (err) {
        readable.destroy();
        throw err;
      }

      this.logger.verbose(`${this.logHeader} promoteTusPartsFromStaging() -> Promoted incomplete TUS upload parts: ${destKey}`);
      return true;
    }

    private async listTusPartKeys(stagingDisk: IDisk, fileId: string): Promise<string[]> {
      const listed = await stagingDisk.listAll(this.tusPartsPrefix(fileId), { recursive: true });
      return Array.from(listed.objects)
        .map((object) => this.listedObjectKey(object))
        .filter((key): key is string => typeof key === 'string' && key.length > 0)
        .sort((left, right) => left.localeCompare(right));
    }

    private listedObjectKey(object: unknown): string | undefined {
      if (!object || typeof object !== 'object') {
        return undefined;
      }
      const candidate = object as { key?: unknown; name?: unknown };
      if (typeof candidate.key === 'string') {
        return candidate.key;
      }
      if (typeof candidate.name === 'string') {
        return candidate.name;
      }
      return undefined;
    }

    private tusPartsPrefix(fileId: string): string {
      return `.tus/${fileId}/parts/`;
    }

    private tusInfoKey(fileId: string): string {
      return `.tus/${fileId}/info.json`;
    }

    private async *streamDiskObjects(stagingDisk: IDisk, keys: string[]): AsyncGenerator<Buffer> {
      for (const key of keys) {
        const stream = await stagingDisk.getStream(key);
        for await (const chunk of stream) {
          yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        }
      }
    }

    // ----------------------------------------------------------------
    // DatastreamService interface implementation
    // ----------------------------------------------------------------

    /**
     * Add multiple datastreams for a record.
     * Each datastream is moved from the staging disk to the primary disk.
     */
    public async addDatastreams(oid: string, datastreams: Datastream[]): Promise<DatastreamServiceResponse> {
      const response = new DatastreamServiceResponse();
      response.message = '';
      let hasFailure = false;

      for (const ds of datastreams) {
        try {
          await this.addDatastream(oid, ds, StorageManagerService.stagingDisk());
          const successMessage = `Successfully uploaded: ${JSON.stringify(ds)}`;
          response.message = _.isEmpty(response.message) ? successMessage : `${response.message}\n${successMessage}`;
        } catch (err) {
          hasFailure = true;
          const failureMessage = `Failed to upload: ${JSON.stringify(ds)}, error is:\n${JSON.stringify(err)}`;
          response.message = _.isEmpty(response.message) ? failureMessage : `${response.message}\n${failureMessage}`;
        }
      }

      response.success = !hasFailure;
      return response;
    }

    /**
     * Diff the old/new attachment fields and add/remove datastreams accordingly.
     * Follows the same pattern as MongoStorageService.updateDatastream.
     */
    public updateDatastream(
      oid: string,
      record: unknown,
      newMetadata: unknown,
      stagingDisk: IDisk,
      fileIdsAdded: Datastream[]
    ): Observable<Promise<unknown>[]> {
      const typedRecord = this.coerceRecord(record);
      const typedNewMetadata = this.coerceMetadata(newMetadata);

      return FormsService
        .getFormByName(typedRecord.metaMetadata.form, true, typedRecord.metaMetadata.brandId)
        .pipe(
          mergeMap(form => {

            const reqs: Promise<unknown>[] = [];
            const attachmentFields = form?.configuration?.attachmentFields;
            if (attachmentFields) {
              typedRecord.metaMetadata.attachmentFields = attachmentFields;

              for (const attField of attachmentFields) {
                const perFieldFileIdsAdded: Datastream[] = [];
                const oldAttachments = this.getAttachments(typedRecord.metadata, attField);
                const newAttachments = this.getAttachments(typedNewMetadata, attField);
                const removeIds: Datastream[] = [];

                const toRemove = this.diffAttachments(oldAttachments, newAttachments);
                for (const removeAtt of toRemove) {
                  if (this.isAttachment(removeAtt)) {
                    removeIds.push(new Datastream(removeAtt));
                  }
                }

                const toAdd = this.diffAttachments(newAttachments, oldAttachments);
                for (const addAtt of toAdd) {
                  if (this.isAttachment(addAtt)) {
                    perFieldFileIdsAdded.push(new Datastream({
                      ...addAtt,
                      name: addAtt['name'],
                      mimeType: addAtt['mimeType'],
                      attachmentField: attField,
                      uploadedBy: addAtt['uploadedBy'],
                    }));
                  }
                }

                fileIdsAdded.push(...perFieldFileIdsAdded);

                reqs.push(this.addAndRemoveDatastreams(oid, perFieldFileIdsAdded, removeIds, stagingDisk));
              }
            }
            return of(reqs);
          })
        );
    }

    private coerceRecord(record: unknown): RecordWithMetadata {
      if (!record || typeof record !== 'object') {
        throw new Error(`${this.logHeader} updateDatastream requires a record object`);
      }
      const rec = record as Record<string, unknown>;
      const metaMetadata = rec.metaMetadata as Record<string, unknown> | undefined;
      const metadata = rec.metadata as Record<string, unknown> | undefined;
      const form = typeof metaMetadata?.form === 'string' ? metaMetadata.form : '';
      const brandId = typeof metaMetadata?.brandId === 'string' ? metaMetadata.brandId : undefined;
      const attachmentFields = Array.isArray(metaMetadata?.attachmentFields)
        ? (metaMetadata?.attachmentFields as string[])
        : undefined;
      return {
        metaMetadata: { form, brandId, attachmentFields },
        metadata: metadata ?? {},
      };
    }

    private coerceMetadata(value: unknown): Record<string, unknown> {
      if (!value || typeof value !== 'object') {
        return {};
      }
      return value as Record<string, unknown>;
    }

    private getAttachments(metadata: Record<string, unknown>, field: string): Array<Record<string, unknown>> {
      const value = metadata[field];
      if (!Array.isArray(value)) {
        return [];
      }
      return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }

    private diffAttachments(
      source: Array<Record<string, unknown>>,
      comparison: Array<Record<string, unknown>>
    ): Array<Record<string, unknown>> {
      return _.differenceBy(source, comparison ?? [], 'fileId');
    }

    private isAttachment(value: Record<string, unknown>): boolean {
      return value['type'] === 'attachment' && typeof value['fileId'] === 'string';
    }

    /**
     * Add a single datastream: read from staging disk, write to primary disk.
     */
    public async addDatastream(oid: string, datastream: Datastream, stagingDisk?: IDisk): Promise<unknown> {
      const fileId = datastream.fileId;
      this.logger.verbose(`${this.logHeader} addDatastream() -> fileId: ${fileId}`);

      const effectiveStagingDisk = stagingDisk ?? StorageManagerService.stagingDisk();
      const primaryDisk = StorageManagerService.primaryDisk();
      const destKey = this.storageKey(oid, fileId);

      const existsInStaging = await effectiveStagingDisk.exists(fileId);
      if (!existsInStaging) {
        const promotedTusParts = await this.promoteTusPartsFromStaging(effectiveStagingDisk, primaryDisk, fileId, destKey);
        if (!promotedTusParts) {
          throw new Error(`Attachment not found in staging: ${fileId}`);
        }
        await this.afterDatastreamPromoted(oid, fileId, destKey, datastream);
        this.logger.verbose(`${this.logHeader} addDatastream() -> Successfully added: ${destKey}`);
        return { success: true, key: destKey };
      }

      const readable = await effectiveStagingDisk.getStream(fileId);
      try {
        await primaryDisk.putStream(destKey, readable);
      } catch (err) {
        readable.destroy();
        throw err;
      }
      await effectiveStagingDisk.delete(fileId);

      await this.afterDatastreamPromoted(oid, fileId, destKey, datastream);

      this.logger.verbose(`${this.logHeader} addDatastream() -> Successfully added: ${destKey}`);
      return { success: true, key: destKey };
    }

    private async afterDatastreamPromoted(oid: string, fileId: string, destKey: string, datastream: Datastream): Promise<void> {
      try {
        const metadataRow = await this.buildMetadataRow(oid, fileId, destKey, datastream.metadata);
        await this.safelyUpsertMetadata(metadataRow);
      } catch (err) {
        this.logger.error(`${this.logHeader} addDatastream() metadata sync failed for ${destKey}`, err);
      }
      await this.safelyRecordAccess({
        oid,
        fileId,
        storageKey: destKey,
        action: 'upload',
        accessedBy: typeof datastream.metadata?.uploadedBy === 'string' ? datastream.metadata.uploadedBy : undefined,
      });
    }

    /**
     * Remove a single datastream from the primary disk.
     */
    public async removeDatastream(oid: string, datastream: Datastream): Promise<unknown> {
      const fileId = datastream.fileId;
      const destKey = this.storageKey(oid, fileId);
      this.logger.verbose(`${this.logHeader} removeDatastream() -> Deleting: ${destKey}`);

      const primaryDisk = StorageManagerService.primaryDisk();
      try {
        await primaryDisk.delete(destKey);
        this.logger.verbose(`${this.logHeader} removeDatastream() -> Delete successful: ${destKey}`);
      } catch {
        // Flydrive may throw if the file doesn't exist; log and continue
        this.logger.verbose(`${this.logHeader} removeDatastream() -> File not found or error deleting: ${destKey}`);
      }
      await this.safelyDeleteMetadata(destKey);
      await this.safelyRecordAccess({ oid, fileId, storageKey: destKey, action: 'remove' });
      return { success: true };
    }

    /**
     * Add and remove datastreams in sequence (additions first, then removals).
     */
    public async addAndRemoveDatastreams(
      oid: string,
      addDatastreams: Datastream[],
      removeDatastreams: Datastream[],
      stagingDisk?: IDisk
    ): Promise<unknown> {
      for (const ds of addDatastreams) {
        await this.addDatastream(oid, ds, stagingDisk);
      }
      for (const ds of removeDatastreams) {
        await this.removeDatastream(oid, ds);
      }
      return { success: true };
    }

    /**
     * Get a datastream (file contents) from the primary disk.
     * Returns an Attachment with a readstream.
     */
    public async getDatastream(
      oid: string,
      fileId: string,
      requestContext?: DatastreamRequestContext
    ): Promise<{ readstream?: NodeJS.ReadableStream; body?: Buffer | string } & Record<string, unknown>> {
      const destKey = this.storageKey(oid, fileId);
      this.logger.verbose(`${this.logHeader} getDatastream() -> Key: ${destKey}`);

      const primaryDisk = StorageManagerService.primaryDisk();

      // Check existence
      let exists = await primaryDisk.exists(destKey);
      if (!exists) {
        exists = await this.promoteFromStagingOnce(oid, fileId, destKey);
      }
      if (!exists) {
        throw new Error(`Attachment not found: ${destKey}`);
      }

      const readstream: Readable = await primaryDisk.getStream(destKey);

      const metadataService = this.attachmentMetadataService();
      const metadataRow = await metadataService?.findOneByStorageKey(destKey);

      let contentType = '';
      let size = 0;
      if (metadataRow) {
        contentType = metadataRow.contentType ?? metadataRow.mimeType ?? '';
        size = metadataRow.contentLength ?? 0;
      } else {
        try {
          const meta = await primaryDisk.getMetaData(destKey);
          contentType = meta.contentType ?? '';
          size = meta.contentLength ?? 0;
          await this.safelyUpsertMetadata({
            oid,
            fileId,
            storageKey: destKey,
            contentType: meta.contentType,
            contentLength: meta.contentLength,
            etag: meta.etag,
            lastModified: this.safeToISOString(meta.lastModified),
          });
        } catch {
          // Metadata may not be available for all drivers
        }
      }

      await this.safelyRecordAccess({
        oid,
        fileId,
        storageKey: destKey,
        action: 'download',
        accessedBy: this.requestUsername(requestContext),
      });

      return {
        readstream,
        contentType,
        size,
      };
    }

    /**
     * List datastreams for a record.
     * If fileId is provided, lists that specific file; otherwise lists all files for the oid.
     */
    public async listDatastreams(
      oid: string,
      fileId: string,
      requestContext?: DatastreamRequestContext
    ): Promise<Record<string, unknown>[]> {
      const primaryDisk = StorageManagerService.primaryDisk();
      const metadataService = this.attachmentMetadataService();

      if (!_.isEmpty(fileId)) {
        const destKey = this.storageKey(oid, fileId);
        const exists = await primaryDisk.exists(destKey);
        if (!exists) {
          return [];
        }
        const metadataRow = await metadataService?.findOneByStorageKey(destKey);
        if (metadataRow) {
          await this.safelyRecordAccess({
            oid,
            fileId,
            storageKey: destKey,
            action: 'list',
            accessedBy: this.requestUsername(requestContext),
            itemCount: 1,
          });
          return [this.metadataToListEntry(metadataRow)];
        }
        try {
          const meta = await primaryDisk.getMetaData(destKey);
          const response = [
            this.datastreamListEntry(destKey, {
              contentType: meta.contentType,
              contentLength: meta.contentLength,
              lastModified: meta.lastModified,
              etag: meta.etag,
            }),
          ];
          await this.safelyUpsertMetadata({
            oid,
            fileId,
            storageKey: destKey,
            contentType: meta.contentType,
            contentLength: meta.contentLength,
            lastModified: this.safeToISOString(meta.lastModified),
            etag: meta.etag,
          });
          await this.safelyRecordAccess({
            oid,
            fileId,
            storageKey: destKey,
            action: 'list',
            accessedBy: this.requestUsername(requestContext),
            itemCount: response.length,
          });
          return response;
        } catch {
          const response = [this.datastreamListEntry(destKey)];
          await this.safelyRecordAccess({
            oid,
            fileId,
            storageKey: destKey,
            action: 'list',
            accessedBy: this.requestUsername(requestContext),
            itemCount: response.length,
          });
          return response;
        }
      }

      // List all files under the oid prefix
      const prefix = `${this.normalizedKeyPrefix()}${oid}/`;
      const result = await primaryDisk.listAll(prefix, { recursive: true });
      type ListedDatastreamEntry = {
        key: string;
        fileObj: Record<string, unknown>;
      };
      const fileEntries: ListedDatastreamEntry[] = Array.from(result.objects).map((obj) => {
        const fileObj = obj as Record<string, unknown>;
        const key = String(fileObj['key'] ?? fileObj['name'] ?? obj);
        return {
          key,
          fileObj,
        };
      });

      const metadataRows = await metadataService?.findByOid(oid) ?? [];
      const metadataByKey = _.keyBy(metadataRows, 'storageKey');
      const hasCompleteMetadata = fileEntries.length > 0 && fileEntries.every(({ key }) => !!metadataByKey[key]);

      if (hasCompleteMetadata) {
        const response = fileEntries.map(({ key }) => this.metadataToListEntry(metadataByKey[key]));
        await this.safelyRecordAccess({
          oid,
          action: 'list',
          accessedBy: this.requestUsername(requestContext),
          itemCount: response.length,
        });
        return response;
      }

      const backfilledMetadataByKey = await this.backfillMetadataFromDisk(oid, fileEntries);
      const response = fileEntries.map(({ key, fileObj }) => {
        const metadataRow = metadataByKey[key];
        if (metadataRow) {
          return this.metadataToListEntry(metadataRow);
        }

        const backfilled = backfilledMetadataByKey[key];
        if (backfilled) {
          return this.datastreamListEntry(key, {
            ...fileObj,
            ...backfilled.details,
            metadata: {
              fileId: backfilled.row.fileId,
              name: backfilled.row.filename ?? backfilled.row.fileId,
              mimeType: backfilled.row.mimeType ?? backfilled.row.contentType,
              filename: backfilled.row.filename,
              uploadedBy: backfilled.row.uploadedBy,
              attachmentField: backfilled.row.attachmentField,
            },
          });
        }

        return this.datastreamListEntry(key, fileObj);
      });

      await this.safelyRecordAccess({
        oid,
        action: 'list',
        accessedBy: this.requestUsername(requestContext),
        itemCount: response.length,
      });
      return response;
    }
  }
}
