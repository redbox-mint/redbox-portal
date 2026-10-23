import type { BrandingModel, DatastreamService, StorageDisks } from '@researchdatabox/redbox-core/extensions/storage';
import type { IntegrationAuditServiceShape } from './api/services/audit';
export interface PDFDependencies {
  readonly config: { readonly appUrl: string; readonly loginPath?: string };
  readonly log: {
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    verbose(...args: unknown[]): void;
  };
  /** Bind the application's accepted-work lifetime before starting detached generation or retries. */
  runAcceptedWork<T>(operation: () => Promise<T>): Promise<T>;
  readonly datastreams: Pick<DatastreamService, 'addDatastream'>;
  readonly audit?: IntegrationAuditServiceShape;
  brandById(id: string): BrandingModel | undefined;
  optionsForBrand(name: string): Readonly<Record<string, unknown>>;
  stagingDisk(): ReturnType<StorageDisks['stagingDisk']>;
}
