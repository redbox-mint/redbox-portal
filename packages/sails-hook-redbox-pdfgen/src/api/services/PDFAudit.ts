/** Temporary global adaptation for existing Sails consumers. */
import { createPdfAudit, type IntegrationAuditServiceShape } from './audit';
export * from './audit';
function audit() {
  const service = Reflect.get(globalThis, 'IntegrationAuditService') as IntegrationAuditServiceShape | undefined;
  return createPdfAudit(service);
}
export function startPdfAudit(...args: Parameters<ReturnType<typeof createPdfAudit>['startPdfAudit']>) {
  return audit().startPdfAudit(...args);
}
export function completePdfAudit(...args: Parameters<ReturnType<typeof createPdfAudit>['completePdfAudit']>) {
  return audit().completePdfAudit(...args);
}
export function failPdfAudit(...args: Parameters<ReturnType<typeof createPdfAudit>['failPdfAudit']>) {
  return audit().failPdfAudit(...args);
}
