import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import defaultDraft from './default-1.0-draft';
import dataRecordDraft from './dataRecord-1.0-draft';
import dataPublicationDraft from './dataPublication-1.0-draft';
import dataPublicationEmbargoed from './dataPublication-1.0-embargoed';
import dataPublicationPublished from './dataPublication-1.0-published';
import dataPublicationQueued from './dataPublication-1.0-queued';
import dataPublicationRetired from './dataPublication-1.0-retired';
import generatedViewOnly from './generated-view-only';

export const FormConfigExports: Record<string, FormConfigFrame> = {
  'default-1.0-draft': defaultDraft,
  'dataRecord-1.0-draft': dataRecordDraft,
  'dataPublication-1.0-draft': dataPublicationDraft,
  'dataPublication-1.0-embargoed': dataPublicationEmbargoed,
  'dataPublication-1.0-published': dataPublicationPublished,
  'dataPublication-1.0-queued': dataPublicationQueued,
  'dataPublication-1.0-retired': dataPublicationRetired,
  'generated-view-only': generatedViewOnly,
};
