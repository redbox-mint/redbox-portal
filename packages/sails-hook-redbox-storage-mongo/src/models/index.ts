import { RecordWLDef } from './Record';
import { DeletedRecordWLDef } from './DeletedRecord';
import { RecordAuditWLDef } from './RecordAudit';
import { IntegrationAuditWLDef } from './IntegrationAudit';
import { RecordSchemaArtifactWLDef } from './RecordSchemaArtifact';
import { RecordSchemaReferenceWLDef } from './RecordSchemaReference';

export * from './Record';
export * from './DeletedRecord';
export * from './RecordAudit';
export * from './IntegrationAudit';
export * from './RecordSchemaArtifact';
export * from './RecordSchemaReference';

export const MongoModels = {
  Record: RecordWLDef,
  DeletedRecord: DeletedRecordWLDef,
  RecordAudit: RecordAuditWLDef,
  IntegrationAudit: IntegrationAuditWLDef,
  RecordSchemaArtifact: RecordSchemaArtifactWLDef,
  RecordSchemaReference: RecordSchemaReferenceWLDef,
};
