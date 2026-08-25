import 'reflect-metadata';
import {
  Entity,
  Attr,
  BeforeCreate,
  BeforeUpdate,
  INITIAL_RECORD_REVISION,
  isRecordRevision,
  isCanonicalSaveRequestId,
  toWaterlineModelDef,
} from '@researchdatabox/redbox-core';

export type JsonMap = Record<string, unknown>;

/**
 * Ordinary Waterline creates always start a new record lineage. Lifecycle
 * restoration uses a server-owned native storage path so it can continue a
 * tombstone lineage without exposing a caller-controlled way to select the
 * initial revision.
 */
const normalizeServerRevision = (record: Record<string, unknown>, proceed: (err?: Error) => void) => {
  record.revision = INITIAL_RECORD_REVISION;
  delete record.incarnationId;
  delete record.lifecycleOperationId;
  proceed();
};

/**
 * Only the atomic compare-and-set path may advance a revision, and it bypasses
 * Waterline to do so. Any other update therefore leaves the stored revision
 * untouched instead of writing a caller-supplied value.
 */
const stripServerRevision = (record: Record<string, unknown>, proceed: (err?: Error) => void) => {
  delete record.revision;
  delete record.incarnationId;
  delete record.lifecycleOperationId;
  proceed();
};

@BeforeCreate(normalizeServerRevision)
@BeforeUpdate(stripServerRevision)
@Entity('record', {
  datastore: 'redboxStorage',
})
export class RecordClass {
  @Attr({ type: 'string', unique: true })
  public redboxOid?: string;

  @Attr({ type: 'string' })
  public harvestId?: string;

  /** Server-owned. Clients must retain the opaque tag rather than assume 0. */
  @Attr({ type: 'number', defaultsTo: INITIAL_RECORD_REVISION, custom: isRecordRevision })
  public revision: number = INITIAL_RECORD_REVISION;

  /** Assigned only by the native conditional-create storage boundary. */
  @Attr({ type: 'string', custom: isCanonicalSaveRequestId })
  public incarnationId?: string;

  @Attr({ type: 'string', custom: isCanonicalSaveRequestId })
  public lifecycleOperationId?: string;

  @Attr({ type: 'json' })
  public metaMetadata?: JsonMap;

  @Attr({ type: 'json' })
  public metadata?: JsonMap;

  @Attr({ type: 'json' })
  public workflow?: JsonMap;

  @Attr({ type: 'json' })
  public authorization?: JsonMap;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateCreated!: string;

  @Attr({ type: 'string', autoUpdatedAt: true })
  public lastSaveDate!: string;
}

export const RecordWLDef = toWaterlineModelDef(RecordClass);
