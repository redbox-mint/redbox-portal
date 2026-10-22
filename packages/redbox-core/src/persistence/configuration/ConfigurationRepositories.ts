import type { DashboardConfigurationData } from '../../configmodels/DashboardSettings';

/** Plain Q records. Identities and association keys are opaque strings. */
export interface ConfigurationRecord {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface AppConfiguration extends ConfigurationRecord {
  branding: string;
  configKey: string;
  configData?: Record<string, unknown> | null;
}
export interface DashboardAggregate extends ConfigurationRecord {
  branding: string;
  revision: number;
  configData: DashboardConfigurationData;
  provenance?: Record<string, unknown>;
}
export interface TranslationBundle extends ConfigurationRecord {
  branding?: string | null;
  locale: string;
  namespace?: string;
  displayName?: string;
  enabled?: boolean;
  uid?: string;
  data: Record<string, unknown>;
}
export interface TranslationEntry extends ConfigurationRecord {
  branding?: string | null;
  bundle?: string | null;
  locale: string;
  namespace?: string;
  key: string;
  value?: unknown;
  uid?: string;
  category?: string | null;
  description?: string | null;
  contentFormat?: 'plain' | 'html' | null;
}
export interface SecretLock {
  owner?: string;
  expiresAt: number;
  cacheToken?: string;
}
/** Fenced, single-document lease operations; milliseconds cross this boundary, never BSON Dates. */
export interface SecretLeaseRepository {
  inspect(name: string, owner?: string): Promise<SecretLock | null>;
  acquire(name: string, owner: string, now: number, expiresAt: number): Promise<void>;
  renew(name: string, owner: string, now: number, expiresAt: number): Promise<boolean>;
  publishToken(name: string, owner: string, now: number, token: string): Promise<boolean>;
  release(name: string, owner: string): Promise<boolean>;
}
export interface ConfigurationRepositories {
  appConfigs: {
    listForBrand(branding: string, configKey?: string): Promise<AppConfiguration[]>;
    findForBrandAndKey(branding: string, configKey: string): Promise<AppConfiguration | null>;
    createConfiguration(values: Partial<AppConfiguration>): Promise<AppConfiguration>;
    replaceForBrandAndKey(
      branding: string,
      configKey: string,
      configData: Record<string, unknown>
    ): Promise<AppConfiguration | null>;
    removeForBrandAndKey(branding: string, configKey: string): Promise<void>;
  };
  dashboards: {
    findForBrand(branding: string): Promise<DashboardAggregate | null>;
    createAggregate(values: Partial<DashboardAggregate>): Promise<DashboardAggregate>;
    compareAndSwap(
      branding: string,
      revision: number,
      next: Pick<DashboardAggregate, 'configData' | 'revision' | 'updatedAt' | 'provenance'>
    ): Promise<boolean>;
  };
  bundles: {
    findByUid(uid: string): Promise<TranslationBundle | null>;
    findById(id: string): Promise<TranslationBundle | null>;
    findForLocale(branding: string, locale: string, namespace: string): Promise<TranslationBundle | null>;
    listForBrand(branding: string, orderByLocale?: boolean): Promise<TranslationBundle[]>;
    createBundle(values: Partial<TranslationBundle>): Promise<TranslationBundle>;
    reviseBundle(id: string, values: Partial<TranslationBundle>): Promise<TranslationBundle | null>;
    setEnabled(
      branding: string,
      locale: string,
      namespace: string,
      enabled: boolean
    ): Promise<TranslationBundle | null>;
  };
  translations: {
    findByUid(uid: string): Promise<TranslationEntry | null>;
    listForLocale(
      branding: string,
      locale: string,
      namespace: string,
      keyPrefix?: string,
      orderByKey?: boolean
    ): Promise<TranslationEntry[]>;
    createEntry(values: Partial<TranslationEntry>): Promise<TranslationEntry>;
    reviseEntry(id: string, values: Partial<TranslationEntry>): Promise<TranslationEntry | null>;
    removeByUid(uid: string): Promise<TranslationEntry | null>;
    addEntries(values: Partial<TranslationEntry>[]): Promise<void>;
  };
  secretLeases: SecretLeaseRepository;
}
