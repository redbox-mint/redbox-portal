import { manualForms } from './pw-remaining-manual';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import defaultDraft from './default-1.0-draft';
import dataRecordDraft from './dataRecord-1.0-draft';
import dataPublicationDraft from './dataPublication-1.0-draft';
import dataPublicationQueued from './dataPublication-1.0-queued';
import dataPublicationEmbargoed from './dataPublication-1.0-embargoed';
import dataPublicationPublished from './dataPublication-1.0-published';
import dataPublicationRetired from './dataPublication-1.0-retired';
import existingLocationsDraft from './existing-locations-workspace-1.0-draft';
import pw01ExpressionChainingDraft from './pw-01-expression-chaining-1.0-draft';
import { pw02Calculations, pw02Validation, pw02Nested } from './pw-02-repeatables';
import { pw03Source, pw03LogicalRow } from './pw-03-logical-row';
import pw04EarlyLookup from './pw-04-early-lookup';
import { pw05Summaries, pw05Nested } from './pw-05-validation-focus';
import pw06Accordion from './pw-06-accordion';
import { pw07DateControl, pw07DateWriteback } from './pw-07-date-writeback';
import pw08SaveBusy from './pw-08-save-busy';
import pw09RapidSaveRetry from './pw-09-rapid-save-retry';
import pw10SaveCompletions from './pw-10-save-completions';
import pw11TransportValidation from './pw-11-transport-validation';
import pw12ConflictResolution from './pw-12-conflict-resolution';

/**
 * Demo form configurations.
 *
 * Moved out of @researchdatabox/redbox-core so the core ships pristine. The
 * framework-generated 'generated-view-only' form remains in core; everything
 * here is supplied to the portal via redbox-hook-dev's registerRedboxFormConfigs().
 */
export const FormConfigExports: Record<string, FormConfigFrame> = {
  ...manualForms,

  'pw-12-conflict-resolution-1.0-draft': pw12ConflictResolution,
  'pw-11-transport-validation-1.0-draft': pw11TransportValidation,
  'pw-10-save-completions-1.0-draft': pw10SaveCompletions,
  'pw-09-rapid-save-retry-1.0-draft': pw09RapidSaveRetry,
  'pw-08-save-busy-1.0-draft': pw08SaveBusy,
  'pw-07-date-control-1.0-draft': pw07DateControl,
  'pw-07-date-writeback-1.0-draft': pw07DateWriteback,
  'pw-06-accordion-1.0-draft': pw06Accordion,
  'pw-05-validation-focus-1.0-draft': pw05Summaries,
  'pw-05-nested-focus-1.0-draft': pw05Nested,
  'pw-04-early-lookup-1.0-draft': pw04EarlyLookup,
  'pw-03-source-1.0-draft': pw03Source,
  'pw-03-logical-row-1.0-draft': pw03LogicalRow,
  'pw-02-calculations-1.0-draft': pw02Calculations,
  'pw-02-validation-1.0-draft': pw02Validation,
  'pw-02-nested-1.0-draft': pw02Nested,
  'pw-01-expression-chaining-1.0-draft': pw01ExpressionChainingDraft,
  'default-1.0-draft': defaultDraft,
  'dataRecord-1.0-draft': dataRecordDraft,
  'dataPublication-1.0-draft': dataPublicationDraft,
  'dataPublication-1.0-queued': dataPublicationQueued,
  'dataPublication-1.0-embargoed': dataPublicationEmbargoed,
  'dataPublication-1.0-published': dataPublicationPublished,
  'dataPublication-1.0-retired': dataPublicationRetired,
  'existing-locations-1.0-draft': existingLocationsDraft,
};
