import { getSiemRepository } from '../../src/persistence/siem/runtime';

/** Bind the authored SIEM fixture collaborators without process globals. */
export function securityCaptureInput(collaborators: any) {
  return {
    get repository() { return getSiemRepository(); },
    get log() { return collaborators.environment?.log ?? console; },
    brand: (value: string) => collaborators.BrandingService.getBrandById(value) ?? collaborators.BrandingService.getBrand(value),
    configuration: (name: string) => collaborators.AppConfigService.getAppConfigurationForBrand(name)?.siem,
    enqueue: (name: string, data: Record<string, unknown>) => collaborators.AgendaQueueService.now(name, data),
    record: (oid: string) => collaborators.RecordsService?.getMeta(oid) ?? Promise.resolve(undefined),
  };
}
export function siemForwardingInput(collaborators: any) {
  return {
    get repository() { return getSiemRepository(); },
    configuration: (id: string) => {
      const brand = collaborators.BrandingService?.getBrandById(id) ?? collaborators.BrandingService?.getBrand(id);
      return brand ? collaborators.AppConfigService.getAppConfigurationForBrand(brand.name)?.siem : undefined;
    },
    brandIds: () => collaborators.BrandingService?.getAvailable?.() ?? [],
  };
}
