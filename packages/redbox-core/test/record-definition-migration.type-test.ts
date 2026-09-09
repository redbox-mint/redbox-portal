import {
  RecordDefinitionMigrationService,
  transformLegacyRecordDefinition,
  type RecordDefinitionMigrationReader,
  type RecordDefinitionMigrationReport,
} from '@researchdatabox/redbox-core';

const reader: RecordDefinitionMigrationReader = {
  async recordTypes() {
    return [];
  },
  async workflowSteps(_recordTypeId: string) {
    return [];
  },
};
const service = new RecordDefinitionMigrationService(reader);
const report: Promise<RecordDefinitionMigrationReport> = service.preflight();
const transformation: ReturnType<typeof transformLegacyRecordDefinition> = transformLegacyRecordDefinition({});
void report;
void transformation;
