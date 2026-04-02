import { Services as services } from '../CoreService';
import { DatastreamService } from '../DatastreamService';
import { DatastreamServiceResponse } from '../DatastreamServiceResponse';
import { Datastream } from '../Datastream';
import { Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import * as _ from 'lodash';
import { Readable } from 'node:stream';
import type { Services as StorageManagerServices } from './StorageManagerService';

type IDisk = StorageManagerServices.IDisk;

type FormLookup = {
  attachmentFields: string[];
};

type RecordWithMetadata = {
  metaMetadata: { form: string; attachmentFields?: string[] };
  metadata: Record<string, unknown>;
};

/**
 * StandardDatastreamService
 *
 * Implements the DatastreamService interface using Flydrive v2 disks
 * managed by StorageManagerService. Files are read from the staging disk
 * and written to the primary disk under the key `{oid}/{fileId}`.
 */
export namespace Services {
  export class StandardDatastream extends services.Core.Service implements DatastreamService {
    protected _exportedMethods: string[] = [
      'addDatastreams',
      'updateDatastream',
      'removeDatastream',
      'addDatastream',
      'addAndRemoveDatastreams',
      'getDatastream',
      'listDatastreams',
    ];

    protected logHeader: string = 'StandardDatastreamService::';

    private getFormsService(): { getFormByName(formName: string, editMode: boolean): Observable<FormLookup | null> } {
      const svc = FormsService as { getFormByName(formName: string, editMode: boolean): Observable<FormLookup | null> };
      if (!svc) {
        throw new Error(`${this.logHeader} FormsService is not available`);
      }
      return svc;
    }

    /**
     * Build the storage key for a file: `{oid}/{fileId}`
     */
    private storageKey(oid: string, fileId: string): string {
      return `${oid}/${fileId}`;
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

      return this.getFormsService()
        .getFormByName(typedRecord.metaMetadata.form, true)
        .pipe(
          mergeMap(form => {
            const safeForm = form ?? { attachmentFields: [] };
            const reqs: Promise<unknown>[] = [];
            typedRecord.metaMetadata.attachmentFields = safeForm.attachmentFields;

            for (const attField of safeForm.attachmentFields) {
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
                  perFieldFileIdsAdded.push(new Datastream(addAtt));
                }
              }

              fileIdsAdded.push(...perFieldFileIdsAdded);

              reqs.push(this.addAndRemoveDatastreams(oid, perFieldFileIdsAdded, removeIds, stagingDisk));
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
      const attachmentFields = Array.isArray(metaMetadata?.attachmentFields)
        ? (metaMetadata?.attachmentFields as string[])
        : undefined;
      return {
        metaMetadata: { form, attachmentFields },
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

      const exists = await effectiveStagingDisk.exists(fileId);
      if (!exists) {
        throw new Error(`Attachment not found in staging: ${fileId}`);
      }

      try {
        await effectiveStagingDisk.move(fileId, destKey);
      } catch {
        const readable = await effectiveStagingDisk.getStream(fileId);
        await primaryDisk.putStream(destKey, readable);
        await effectiveStagingDisk.delete(fileId);
      }

      this.logger.verbose(`${this.logHeader} addDatastream() -> Successfully added: ${destKey}`);
      return { success: true, key: destKey };
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
      fileId: string
    ): Promise<{ readstream?: NodeJS.ReadableStream; body?: Buffer | string } & Record<string, unknown>> {
      const destKey = this.storageKey(oid, fileId);
      this.logger.verbose(`${this.logHeader} getDatastream() -> Key: ${destKey}`);

      const primaryDisk = StorageManagerService.primaryDisk();

      // Check existence
      const exists = await primaryDisk.exists(destKey);
      if (!exists) {
        throw new Error(`Attachment not found: ${destKey}`);
      }

      const readstream: Readable = await primaryDisk.getStream(destKey);

      // Try to get metadata for content type / size
      let contentType = '';
      let size = 0;
      try {
        const meta = await primaryDisk.getMetaData(destKey);
        contentType = meta.contentType ?? '';
        size = meta.contentLength ?? 0;
      } catch {
        // Metadata may not be available for all drivers
      }

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
    public async listDatastreams(oid: string, fileId: string): Promise<Record<string, unknown>[]> {
      const primaryDisk = StorageManagerService.primaryDisk();

      if (!_.isEmpty(fileId)) {
        const destKey = this.storageKey(oid, fileId);
        const exists = await primaryDisk.exists(destKey);
        if (!exists) {
          return [];
        }
        try {
          const meta = await primaryDisk.getMetaData(destKey);
          return [
            {
              filename: destKey,
              contentType: meta.contentType,
              contentLength: meta.contentLength,
              lastModified: meta.lastModified,
              etag: meta.etag,
            },
          ];
        } catch {
          return [{ filename: destKey }];
        }
      }

      // List all files under the oid prefix
      const prefix = `${oid}/`;
      const result = await primaryDisk.listAll(prefix, { recursive: true });
      const files: Record<string, unknown>[] = [];
      for (const obj of result.objects) {
        const fileObj = obj as Record<string, unknown>;
        files.push({
          filename: fileObj['key'] ?? fileObj['name'] ?? String(obj),
          ...fileObj,
        });
      }
      return files;
    }
  }
}
