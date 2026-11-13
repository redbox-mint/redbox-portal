/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';

/** Native store owns atomic updates and creates the partial binding index. */
@Entity('figsharesync')
export class FigshareSyncClass {
  @Attr({ type: 'string', required: true, unique: true }) public oid!: string;
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'number' }) public revision!: number;
  @Attr({ type: 'number' }) public importedGeneration!: number;
  @Attr({ type: 'json' }) public work!: object;
  @Attr({ type: 'number', allowNull: true }) public nextActionAt!: number | null;
  @Attr({ type: 'number' }) public dispatchUntil!: number;
  @Attr({ type: 'string', allowNull: true }) public leaseOwner!: string | null;
  @Attr({ type: 'number' }) public leaseUntil!: number;
  @Attr({ type: 'json' }) public binding?: object;
  @Attr({ type: 'string' }) public namespace?: string;
  @Attr({ type: 'string' }) public articleId?: string;
  @Attr({ type: 'json' }) public create?: object;
  @Attr({ type: 'number' }) public createGeneration?: number;
  @Attr({ type: 'number' }) public createRequest?: number;
  @Attr({ type: 'json' }) public publish?: object;
  @Attr({ type: 'json' }) public receipts!: object[];
  @Attr({ type: 'json' }) public checkpoints!: object;
  @Attr({ type: 'string' }) public status!: string;
  @Attr({ type: 'string' }) public waitingReason?: string;
  @Attr({ type: 'string' }) public publication?: string;
  @Attr({ type: 'boolean' }) public embargoed?: boolean;
  @Attr({ type: 'boolean' }) public accessible?: boolean;
  @Attr({ type: 'string' }) public observedAt?: string;
  @Attr({ type: 'string' }) public publicationAuditKey?: string;
  @Attr({ type: 'json' }) public error?: object;
  @Attr({ type: 'json' }) public audit?: object;
  @Attr({ type: 'boolean' }) public auditClosed?: boolean;
  @Attr({ type: 'json' }) public corrections?: object[];
}
export const FigshareSyncWLDef = toWaterlineModelDef(FigshareSyncClass);

declare global {
  const FigshareSync: { getDatastore(): { manager: import('mongodb').Db } };
}
