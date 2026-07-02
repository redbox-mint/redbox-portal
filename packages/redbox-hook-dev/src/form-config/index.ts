import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import defaultDraft from './default-1.0-draft';
import dataRecordDraft from './dataRecord-1.0-draft';
import dataPublicationDraft from './dataPublication-1.0-draft';
import dataPublicationQueued from './dataPublication-1.0-queued';
import dataPublicationEmbargoed from './dataPublication-1.0-embargoed';
import dataPublicationPublished from './dataPublication-1.0-published';
import dataPublicationRetired from './dataPublication-1.0-retired';
import existingLocationsDraft from './existing-locations-workspace-1.0-draft';

/**
 * Demo form configurations.
 *
 * Moved out of @researchdatabox/redbox-core so the core ships pristine. The
 * framework-generated 'generated-view-only' form remains in core; everything
 * here is supplied to the portal via redbox-hook-dev's registerRedboxFormConfigs().
 */
export const FormConfigExports: Record<string, FormConfigFrame> = {
  'default-1.0-draft': defaultDraft,
  'dataRecord-1.0-draft': dataRecordDraft,
  'dataPublication-1.0-draft': dataPublicationDraft,
  'dataPublication-1.0-queued': dataPublicationQueued,
  'dataPublication-1.0-embargoed': dataPublicationEmbargoed,
  'dataPublication-1.0-published': dataPublicationPublished,
  'dataPublication-1.0-retired': dataPublicationRetired,
  'existing-locations-1.0-draft': existingLocationsDraft,
};
