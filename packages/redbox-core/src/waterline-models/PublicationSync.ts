/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';
import type { PublicationSyncModel } from '../model/storage/PublicationSyncModel';

/** Native store (PUB-05) owns compound/partial indexes and conditional mutations. */
@Entity('publicationsync')
export class PublicationSyncClass implements PublicationSyncModel {
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public oid!: string;
  @Attr({ type: 'string', required: true }) public destinationId!: string;
  @Attr({ type: 'number', required: true }) public schemaVersion!: 1;
  @Attr({ type: 'string', required: true }) public providerId!: string;
  @Attr({ type: 'number', required: true }) public providerStateVersion!: number;
  @Attr({ type: 'json' }) public providerState!: PublicationSyncModel['providerState'];
  @Attr({ type: 'number' }) public revision!: number;
  @Attr({ type: 'number' }) public sourceGeneration!: number;
  @Attr({ type: 'number' }) public sourceRevision!: number;
  @Attr({ type: 'string' }) public approvalId!: string;
  @Attr({ type: 'number' }) public approvalEpoch!: number;
  @Attr({ type: 'string' }) public sourceDigest!: string;
  @Attr({ type: 'json' }) public source!: PublicationSyncModel['source'];
  @Attr({ type: 'json' }) public recoverySources!: PublicationSyncModel['recoverySources'];
  @Attr({ type: 'string' }) public configurationDigest!: string;
  @Attr({ type: 'string' }) public targetFingerprint!: string;
  @Attr({ type: 'json' }) public lease!: PublicationSyncModel['lease'];
  @Attr({ type: 'number' }) public dispatchUntil!: number;
  @Attr({ type: 'number', allowNull: true }) public nextActionAt!: number | null;
  @Attr({ type: 'json' }) public work!: PublicationSyncModel['work'];
  @Attr({ type: 'string' }) public status!: PublicationSyncModel['status'];
  @Attr({ type: 'string' }) public waitingReason?: string;
  @Attr({ type: 'json' }) public retry?: PublicationSyncModel['retry'];
  @Attr({ type: 'json' }) public retryEpisodes?: PublicationSyncModel['retryEpisodes'];
  @Attr({ type: 'json' }) public binding?: PublicationSyncModel['binding'];
  @Attr({ type: 'string' }) public remoteNamespace?: string;
  @Attr({ type: 'string' }) public remoteObjectId?: string;
  @Attr({ type: 'json' }) public operations!: PublicationSyncModel['operations'];
  @Attr({ type: 'json' }) public completion?: PublicationSyncModel['completion'];
  @Attr({ type: 'boolean' }) public workflowPending?: boolean;
  @Attr({ type: 'json' }) public links!: PublicationSyncModel['links'];
  @Attr({ type: 'json' }) public audit?: PublicationSyncModel['audit'];
  @Attr({ type: 'json' }) public correctionReferences!: string[];
}
export const PublicationSyncWLDef = toWaterlineModelDef(PublicationSyncClass);

declare global {
  const PublicationSync: { getDatastore(): { manager: import('mongodb').Db } };
}
