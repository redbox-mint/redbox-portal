import { Services as services } from '../CoreService';
import { AttachmentAccessAuditAttributes, AttachmentMetadataAttributes } from '../waterline-models';

export namespace Services {
  export type AttachmentAccessAction = 'access' | 'download' | 'list' | 'upload' | 'remove';
  export type AttachmentMetadataInput = Omit<AttachmentMetadataAttributes, 'id' | 'createdAt' | 'updatedAt'>;
  export type AttachmentAccessAuditInput = Omit<AttachmentAccessAuditAttributes, 'id' | 'createdAt' | 'updatedAt'>;
  export type AttachmentAccessEvent = {
    oid: string;
    fileId?: string;
    storageKey?: string;
    action: AttachmentAccessAction;
    accessedBy?: string;
    itemCount?: number;
  };

  export class AttachmentMetadataService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'upsert',
      'findByOid',
      'findOneByStorageKey',
      'deleteByStorageKey',
      'recordAccess',
    ];

    protected override logHeader: string = 'AttachmentMetadataService::';

    public async upsert(row: AttachmentMetadataInput): Promise<void> {
      const storageKey = String(row.storageKey ?? '').trim();
      if (!storageKey) {
        throw new Error('AttachmentMetadataService.upsert requires storageKey');
      }

      const payload = this.normalizeMetadataRow(row);
      const oid = String(payload.oid ?? '').trim();
      const fileId = String(payload.fileId ?? '').trim();
      const existing = await AttachmentMetadata.findOne({ storageKey }) as AttachmentMetadataAttributes | null
        ?? (oid && fileId
          ? await AttachmentMetadata.findOne({ oid, fileId }) as AttachmentMetadataAttributes | null
          : null);
      if (existing?.id) {
        await AttachmentMetadata.updateOne({ id: existing.id }).set(payload);
        return;
      }
      await AttachmentMetadata.create(payload).fetch();
    }

    public async findByOid(oid: string): Promise<AttachmentMetadataAttributes[]> {
      const normalizedOid = String(oid ?? '').trim();
      if (!normalizedOid) {
        return [];
      }
      return await AttachmentMetadata.find({ oid: normalizedOid }).sort([{ createdAt: 'ASC' }]) as AttachmentMetadataAttributes[];
    }

    public async findOneByStorageKey(storageKey: string): Promise<AttachmentMetadataAttributes | undefined> {
      const normalizedStorageKey = String(storageKey ?? '').trim();
      if (!normalizedStorageKey) {
        return undefined;
      }
      return await AttachmentMetadata.findOne({ storageKey: normalizedStorageKey }) as AttachmentMetadataAttributes | undefined;
    }

    public async deleteByStorageKey(storageKey: string): Promise<void> {
      const normalizedStorageKey = String(storageKey ?? '').trim();
      if (!normalizedStorageKey) {
        return;
      }
      await AttachmentMetadata.destroy({ storageKey: normalizedStorageKey });
    }

    public async recordAccess(event: AttachmentAccessEvent): Promise<void> {
      let auditId: string | number | undefined;

      try {
        const normalizedEvent = this.normalizeAccessEvent(event);
        if (!normalizedEvent.oid || !normalizedEvent.action) {
          return;
        }

        const createdAudit = await AttachmentAccessAudit.create(normalizedEvent as AttachmentAccessAuditAttributes).fetch() as AttachmentAccessAuditAttributes;
        auditId = createdAudit.id;

        if (!normalizedEvent.storageKey || normalizedEvent.action === 'list') {
          return;
        }

        const existing = await AttachmentMetadata.findOne({ storageKey: normalizedEvent.storageKey }) as AttachmentMetadataAttributes | null;
        if (!existing?.id) {
          return;
        }

        const currentCount = Number(existing.accessCount ?? 0);
        const nextCount = this.shouldIncrementAccessCount(normalizedEvent.action) ? currentCount + 1 : currentCount;
        await AttachmentMetadata.updateOne({ id: existing.id }).set({
          lastAccessedAt: normalizedEvent.accessedAt,
          lastAccessedBy: normalizedEvent.accessedBy,
          accessCount: nextCount,
        });
      } catch (err) {
        let failure = err;

        if (auditId !== undefined) {
          try {
            await this.rollbackAccessAudit(auditId);
          } catch (rollbackErr) {
            failure = new Error(
              `AttachmentMetadataService.recordAccess metadata update failed after audit write and audit rollback failed: ${this.errorMessage(err)}; rollback error: ${this.errorMessage(rollbackErr)}`
            );
          }
        }

        this.logger.error(`${this.logHeader} recordAccess() failed`, failure);
        throw failure;
      }
    }

    private shouldIncrementAccessCount(action: string): boolean {
      return action === 'download' || action === 'access';
    }

    private async rollbackAccessAudit(auditId: string | number): Promise<void> {
      await AttachmentAccessAudit.destroy({ id: auditId });
    }

    private errorMessage(value: unknown): string {
      return value instanceof Error ? value.message : String(value);
    }

    private normalizeMetadataRow(row: AttachmentMetadataInput): Partial<AttachmentMetadataInput> {
      return {
        oid: String(row.oid ?? '').trim(),
        fileId: String(row.fileId ?? '').trim(),
        storageKey: String(row.storageKey ?? '').trim(),
        contentType: this.optionalString(row.contentType),
        contentLength: this.optionalNumber(row.contentLength),
        etag: this.optionalString(row.etag),
        lastModified: this.optionalDateString(row.lastModified),
        filename: this.optionalString(row.filename),
        mimeType: this.optionalString(row.mimeType),
        uploadedBy: this.optionalString(row.uploadedBy),
        attachmentField: this.optionalString(row.attachmentField),
        lastAccessedAt: this.optionalDateString(row.lastAccessedAt),
        lastAccessedBy: this.optionalString(row.lastAccessedBy),
        accessCount: this.optionalNumber(row.accessCount) ?? 0,
      };
    }

    private normalizeAccessEvent(event: AttachmentAccessEvent): AttachmentAccessAuditInput {
      return {
        oid: String(event.oid ?? '').trim(),
        fileId: this.optionalString(event.fileId),
        storageKey: this.optionalString(event.storageKey),
        action: String(event.action ?? '').trim(),
        accessedBy: this.optionalString(event.accessedBy),
        accessedAt: new Date().toISOString(),
        itemCount: this.optionalNumber(event.itemCount),
      };
    }

    private optionalString(value: unknown): string | undefined {
      const normalized = String(value ?? '').trim();
      return normalized ? normalized : undefined;
    }

    private optionalNumber(value: unknown): number | undefined {
      if (value === null || value === undefined || value === '') {
        return undefined;
      }
      const normalized = Number(value);
      return Number.isFinite(normalized) ? normalized : undefined;
    }

    private optionalDateString(value: unknown): string | undefined {
      if (!value) {
        return undefined;
      }
      const normalizedDate = new Date(value as string | number | Date);
      return Number.isNaN(normalizedDate.getTime()) ? undefined : normalizedDate.toISOString();
    }
  }
}

declare global {
  let AttachmentMetadataService: Services.AttachmentMetadataService;
}
