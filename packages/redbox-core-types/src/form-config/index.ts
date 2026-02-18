import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import defaultDraft from './default-1.0-draft';
import dataRecordDraft from './dataRecord-1.0-draft';

export const FormConfigExports: Record<string, FormConfigFrame> = {
  'default-1.0-draft': defaultDraft,
  'dataRecord-1.0-draft': dataRecordDraft
};
