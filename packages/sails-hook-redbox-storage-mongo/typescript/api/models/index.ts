/**
 * MongoDB Storage Models
 * 
 * This module exports Waterline model definitions for models that use
 * the MongoDB storage datastore (redboxStorage).
 */

import { RecordWLDef } from './Record';
import { DeletedRecordWLDef } from './DeletedRecord';
import { RecordAuditWLDef } from './RecordAudit';

// Re-export individual model definitions
export * from './Record';
export * from './DeletedRecord';
export * from './RecordAudit';

// Consolidated Models map for hook registration
export const MongoModels = {
    Record: RecordWLDef,
    DeletedRecord: DeletedRecordWLDef,
    RecordAudit: RecordAuditWLDef,
};
