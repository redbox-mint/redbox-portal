import { RecordWLDef } from './Record';
import { DeletedRecordWLDef } from './DeletedRecord';
import { RecordAuditWLDef } from './RecordAudit';

export * from './Record';
export * from './DeletedRecord';
export * from './RecordAudit';

export const MongoModels = {
  Record: RecordWLDef,
  DeletedRecord: DeletedRecordWLDef,
  RecordAudit: RecordAuditWLDef,
};
