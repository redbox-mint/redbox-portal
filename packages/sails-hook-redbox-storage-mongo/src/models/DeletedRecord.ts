import 'reflect-metadata';
import {
  Entity,
  Attr,
  BeforeCreate,
  BeforeUpdate,
  DELETED_RECORD_LIFECYCLE_STATES,
  INITIAL_RECORD_REVISION,
  isCanonicalSaveRequestId,
  isDeletedRecordLifecycleOperation,
  isDeletedRecordLifecycleState,
  isRecordRevision,
  toWaterlineModelDef,
  type DeletedRecordLifecycleOperation,
  type DeletedRecordLifecycleState,
} from '@researchdatabox/redbox-core';

/**
 * Ordinary Waterline creates cannot choose a tombstone revision. The storage
 * lifecycle path installs lineage-bearing tombstones through its native
 * primitive after deriving the revision from authoritative active state.
 */
const normalizeTombstoneLifecycle = (record: Record<string, unknown>, proceed: (err?: Error) => void) => {
  record.revision = INITIAL_RECORD_REVISION;
  delete record.incarnationId;
  if (!isDeletedRecordLifecycleState(record.lifecycleState)) {
    record.lifecycleState = 'deleted';
  }
  if (record.deletedRecordMetadata && typeof record.deletedRecordMetadata === 'object') {
    delete (record.deletedRecordMetadata as Record<string, unknown>).revision;
  }
  proceed();
};

/** Tombstone revisions only advance through the atomic tombstone primitives. */
const stripTombstoneRevision = (record: Record<string, unknown>, proceed: (err?: Error) => void) => {
  delete record.revision;
  delete record.incarnationId;
  if (record.deletedRecordMetadata && typeof record.deletedRecordMetadata === 'object') {
    delete (record.deletedRecordMetadata as Record<string, unknown>).revision;
  }
  proceed();
};

@BeforeCreate(normalizeTombstoneLifecycle)
@BeforeUpdate(stripTombstoneRevision)
@Entity('deletedrecord', { datastore: 'redboxStorage' })
export class DeletedRecordClass {
  @Attr({ type: 'string', unique: true })
  public redboxOid?: string;

  /** Sole authority for the current tombstone lifecycle revision. */
  @Attr({ type: 'number', defaultsTo: INITIAL_RECORD_REVISION, custom: isRecordRevision })
  public revision: number = INITIAL_RECORD_REVISION;

  /** Assigned only by native lifecycle storage from the durable OID owner. */
  @Attr({ type: 'string', custom: isCanonicalSaveRequestId })
  public incarnationId?: string;

  @Attr({ type: 'string' })
  public brandId?: string;

  @Attr({ type: 'string', defaultsTo: 'deleted', isIn: DELETED_RECORD_LIFECYCLE_STATES })
  public lifecycleState: DeletedRecordLifecycleState = 'deleted';

  @Attr({ type: 'json', custom: isDeletedRecordLifecycleOperation })
  public lifecycleOperation?: DeletedRecordLifecycleOperation;

  @Attr({ type: 'json' })
  public deletedRecordMetadata?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateDeleted!: string;
}

export const DeletedRecordWLDef = toWaterlineModelDef(DeletedRecordClass);
