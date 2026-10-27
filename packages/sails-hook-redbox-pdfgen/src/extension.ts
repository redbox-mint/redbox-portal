import type { RedboxExtension } from '@researchdatabox/redbox-core/extensions';
import { Services } from './api/services/PDF';
import { PDFGEN_CONFIG_MODEL } from './api/configmodels/PDFGenConfig';
import { agendaQueue } from './config/agendaQueue';
import { pdfgen } from './config/pdfgen';
import type { PDFDependencies } from './dependencies';
export type { PDFDependencies } from './dependencies';
export function registerRedboxExtension(): RedboxExtension {
  return {
    apiVersion: 1,
    config: { pdfgen },
    configModels: [{ name: 'pdfgen', definition: PDFGEN_CONFIG_MODEL }],
    modules: [{ name: 'pdf', requires: ['storage'], create: (input: PDFDependencies) => new Services.PDF(input) }],
    jobs: agendaQueue.jobs,
  };
}
export { Services } from './api/services/PDF';
