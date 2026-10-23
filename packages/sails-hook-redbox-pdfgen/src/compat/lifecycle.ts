import { registerPersistenceResource } from '@researchdatabox/redbox-core/extensions/storage';
import { attachSailsPersistenceLifecycle } from '@researchdatabox/redbox-core/compat/sails';
import type { Services } from '../api/services/PDF';
/** The legacy host delegates cleanup to the same shared owner; no PDF lower patch. */
export function installLegacyPDFLifecycle(app: Sails.Application, pdf: Services.PDF): void {
  registerPersistenceResource(app, 'pdf', { drain: () => pdf.drain(), close: () => pdf.close() });
  attachSailsPersistenceLifecycle(app);
}
