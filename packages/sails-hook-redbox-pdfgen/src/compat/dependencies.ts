import type { PDFDependencies } from '../dependencies';
import type { IntegrationAuditServiceShape } from '../api/services/audit';
export function legacyPDFDependencies(): PDFDependencies {
  return {
    get config() {
      return { appUrl: sails.config.appUrl, loginPath: sails.config.auth?.loginPath };
    },
    get log() {
      return sails.log;
    },
    get datastreams() {
      const name = sails.config.record.datastreamService;
      if (!name) throw new Error('PDF requires a configured datastream service.');
      return sails.services[name] as PDFDependencies['datastreams'];
    },
    get audit() {
      return Reflect.get(globalThis, 'IntegrationAuditService') as IntegrationAuditServiceShape | undefined;
    },
    brandById: id => BrandingService.getBrandById(id),
    optionsForBrand: name => (sails.config.brandingAware(name) as { pdfgen?: Record<string, unknown> }).pdfgen ?? {},
    stagingDisk: () => StorageManagerService.stagingDisk(),
  };
}
