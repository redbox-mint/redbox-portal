/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';

@Entity('attachmentaccessaudit', {
  indexes: [
    { attributes: { oid: 1, accessedAt: -1 } },
    { attributes: { storageKey: 1, accessedAt: -1 } },
    { attributes: { action: 1, accessedAt: -1 } },
  ]
})
export class AttachmentAccessAuditClass {
  @Attr({ type: 'string', required: true })
  public oid!: string;

  @Attr({ type: 'string' })
  public fileId?: string;

  @Attr({ type: 'string' })
  public storageKey?: string;

  @Attr({ type: 'string', required: true })
  public action!: string;

  @Attr({ type: 'string' })
  public accessedBy?: string;

  @Attr({ type: 'string', columnType: 'datetime', required: true })
  public accessedAt!: string | Date;

  @Attr({ type: 'number' })
  public itemCount?: number;
}

export const AttachmentAccessAuditWLDef = toWaterlineModelDef(AttachmentAccessAuditClass);

export interface AttachmentAccessAuditAttributes extends Sails.WaterlineAttributes {
  accessedAt: string | Date;
  accessedBy?: string;
  action: 'access' | 'download' | 'list' | 'upload' | 'remove' | string;
  fileId?: string;
  itemCount?: number;
  oid: string;
  storageKey?: string;
}

export interface AttachmentAccessAuditWaterlineModel extends Sails.Model<AttachmentAccessAuditAttributes> {
  attributes: AttachmentAccessAuditAttributes;
}

declare global {
  const AttachmentAccessAudit: AttachmentAccessAuditWaterlineModel;
}
