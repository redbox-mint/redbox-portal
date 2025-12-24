// This file is generated from internal/sails-ts/api/services/I18nEntriesService.ts. Do not edit directly.
import { Services as services, BrandingModel, PopulateExportedMethods } from '../../index';
import { Sails, Model } from 'sails';

export interface Bundle {
    id?: string | number;
    branding?: any;
    locale: string;
    namespace?: string;
    data: any;
  }

export interface I18nEntriesService {
  bootstrap(languages?: string[]): Promise<void>;
  getEntry(branding: BrandingModel, locale: string, namespace: string, key: string): Promise<any | null>;
  setEntry(branding: BrandingModel, locale: string, namespace: string, key: string, value: any, options?: { bundleId?: string; category?: string; description?: string; noReload?: boolean }): Promise<any>;
  deleteEntry(branding: BrandingModel, locale: string, namespace: string, key: string): Promise<boolean>;
  listEntries(branding: BrandingModel, locale: string, namespace: string, keyPrefix?: string): Promise<any[]>;
  getBundle(branding: BrandingModel, locale: string, namespace: string): Promise<any | null>;
  listBundles(branding: BrandingModel): Promise<any[]>;
  setBundle(branding: BrandingModel, locale: string, namespace: string, data: any, displayName?: string, options?: { splitToEntries?: boolean; overwriteEntries?: boolean }): Promise<any>;
  updateBundleEnabled(branding: BrandingModel, locale: string, namespace: string, enabled: boolean): Promise<any>;
  composeNamespace(entries: Array<{ key: string; value: any }>): any;
  syncEntriesFromBundle(bundleOrId: any, overwrite?: any): Promise<void>;
  loadCentralizedMeta(): Promise<Record<string, any>>;
  loadLanguageNames(): Promise<Record<string, string>>;
  getLanguageDisplayName(locale: string): Promise<string>;
}
