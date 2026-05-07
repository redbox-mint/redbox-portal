import { RecordWLDef } from './Record';
import { DeletedRecordWLDef } from './DeletedRecord';
import { RecordAuditWLDef } from './RecordAudit';
import { IntegrationAuditWLDef } from './IntegrationAudit';

export * from './Record';
export * from './DeletedRecord';
export * from './RecordAudit';
export * from './IntegrationAudit';

export const MongoModels = {
  Record: RecordWLDef,
  DeletedRecord: DeletedRecordWLDef,
  RecordAudit: RecordAuditWLDef,
  IntegrationAudit: IntegrationAuditWLDef,
};
