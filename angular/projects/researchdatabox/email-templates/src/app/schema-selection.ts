import type { EmailSchemaTarget } from '@researchdatabox/sails-ng-common';
import type { SchemaSelection } from '@researchdatabox/sails-ng-common';
export type { SchemaSelection } from '@researchdatabox/sails-ng-common';
/** Prefer a valid saved selection, then the selected record, then the brand's first type. */
export function defaultSchemaSelection(
  targets: EmailSchemaTarget[],
  context?: Record<string, unknown> | null,
  saved?: SchemaSelection | null
): SchemaSelection | null {
  const record = context?.['record'] as Record<string, unknown> | undefined;
  const meta = record?.['metaMetadata'] as Record<string, unknown> | undefined;
  const workflow = record?.['workflow'] as Record<string, unknown> | undefined;
  const type =
    targets.find(t => t.id === saved?.recordType) ?? targets.find(t => t.id === meta?.['type']) ?? targets[0];
  if (!type) return null;
  const requestedStage =
    saved?.recordType === type.id ? saved.stage : meta?.['type'] === type.id ? workflow?.['stage'] : undefined;
  const stage = type.stages.find(s => s.id === requestedStage) ?? type.stages.find(s => s.starting) ?? type.stages[0];
  return stage ? { recordType: type.id, stage: stage.id } : null;
}
