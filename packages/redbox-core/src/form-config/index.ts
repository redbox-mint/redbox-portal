import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

import partyForm from './party-1.0-draft';
import generatedViewOnly from './generated-view-only';

/**
 * Core form configurations.
 *
 * Core ships only the framework-generated read-only form. Demo forms
 * (default-1.0-draft, dataRecord-1.0-draft, etc.) now live in redbox-hook-dev
 * and are merged in by the loader when that hook is installed.
 */
export const FormConfigExports: Record<string, FormConfigFrame> = {
  'party-1.0-draft': partyForm,
  'generated-view-only': generatedViewOnly,
};
