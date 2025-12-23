// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Services as services, BrandingModel, PopulateExportedMethods } from '@researchdatabox/redbox-core-types';
import { Sails, Model } from 'sails';

declare var sails: Sails;
declare var _;

// Waterline globals
declare var I18nTranslation: Model;
declare var I18nBundle: Model;
declare let BrandingService: any;

export module Services {

  export interface Bundle {
    id?: string | number;
    branding?: any;
    locale: string;
    namespace?: string;
    data: any;
  }

  export function isBundle(obj: any): obj is Bundle {
    return (
      obj &&
      typeof obj === 'object' &&
      'data' in obj &&
      'locale' in obj
    );
  }

  /**
   * I18nEntriesService: Manage i18next translations stored in DB.
   * - Per-key entries in I18nTranslation
   * - Whole-namespace bundles in I18nBundle
   */
  @PopulateExportedMethods
  export class I18nEntries extends services.Core.Service {

    
  /**
   * Seed default i18n bundles into DB from language-defaults for the default brand.
   * - Only creates bundles if none exist (no overwrite).
   * @param languages Optional list of languages to bootstrap. If omitted, scans language-defaults.
   */
  public async bootstrap(languages?: string[]): Promise<void> {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        
        // Discover supported languages by scanning language-defaults directory
        const localesDir = path.join(sails.config.appPath, 'language-defaults');
        const supported: string[] = [];
        
        if (languages && languages.length > 0) {
          supported.push(...languages);
        } else {
          if (fs.existsSync(localesDir)) {
            const entries = fs.readdirSync(localesDir, { withFileTypes: true });
            supported.push(...entries.filter(d => d.isDirectory()).map(d => d.name));
          }
          
          // Fallback to config if no directories found
          if (supported.length === 0) {
            supported.push(...((sails?.config?.i18n?.next?.init?.supportedLngs as string[]) || ['en']));
          }
        }
        
        const namespaces: string[] = (sails?.config?.i18n?.next?.init?.ns as string[]) || ['translation'];

        // Default brand
        const defaultBrand: BrandingModel | null = BrandingService.getBrand('default');
        if (!defaultBrand) {
          this.logger.warn('Default brand not found, skipping seeding');
          return;
        }

        for (const lng of supported) {
          for (const ns of namespaces) {
            try {
              
              const filePath = path.join(localesDir, lng, `${ns}.json`);
              if (!fs.existsSync(filePath)) {
                continue; // nothing to seed/sync for this pair
              }

              const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
              const existing = await this.getBundle(defaultBrand, lng, ns);
              if (!existing) {
                // First-time seed: create bundle and split to entries (no overwrite)
                await this.setBundle(defaultBrand, lng, ns, json, undefined, { splitToEntries: true, overwriteEntries: false });
                this.logger.debug(`Seeded bundle ${defaultBrand.id}:${lng}:${ns}`);
              } else {
                // Incremental: merge defaults into existing bundle data
                // Clone to ensure we have a plain object and don't run into ORM object issues
                const dbData = _.cloneDeep(existing.data || {});
                
                // defaultsDeep fills in missing properties in dbData from json
                _.defaultsDeep(dbData, json);
                
                // Update the bundle with merged data
                const updatedBundle = await I18nBundle.updateOne({ id: existing.id }).set({ data: dbData });
                
                // Sync entries to match the updated bundle
                // Use the updated record when available to avoid type/refresh edge cases
                this.syncEntriesFromBundle(updatedBundle || { ...existing, data: dbData }, false)
                  .catch(err => this.logger.warn(`Background sync failed for ${defaultBrand.id}:${lng}:${ns}`, err));
                
                this.logger.debug(`Merged defaults and synced keys for ${defaultBrand.id}:${lng}:${ns}`);
              }
            } catch (e) {
              this.logger.debug('Skipping seed/sync for', lng, ns, 'due to error:', (e as Error)?.message || e);
            }
          }
        }
      } catch (err) {
        this.logger.warn('I18nEntriesService.bootstrap failed:', (err as Error)?.message || err);
      }
    }

    // Basic flatten utility for dot-notation keys that fits the pattern required for i18next entries
    private flatten(obj: any, prefix = '', out: any = {}): any {
      for (const key of Object.keys(obj || {})) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          this.flatten(value, newKey, out);
        } else {
          out[newKey] = value;
        }
      }
      return out;
    }

    // Minimal unflatten utility for dot-notation keys that i18next uses
    private unflatten(flatObj: any): any {
      const result: any = {};
      for (const flatKey of Object.keys(flatObj || {})) {
        const parts = flatKey.split('.');
        let cursor = result;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (i === parts.length - 1) {
            cursor[p] = flatObj[flatKey];
          } else {
            if (cursor[p] == null || typeof cursor[p] !== 'object') cursor[p] = {};
            cursor = cursor[p];
          }
        }
      }
      return result;
    }

    // Minimal setter for dot-notation keys inside an object
    private setNested(obj: any, dottedKey: string, value: any): void {
      if (!obj) return;
      const parts = String(dottedKey).split('.');
      let cursor = obj;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const isLast = i === parts.length - 1;
        if (isLast) {
          cursor[p] = value;
        } else {
          if (cursor[p] == null || typeof cursor[p] !== 'object') cursor[p] = {};
          cursor = cursor[p];
        }
      }
    }

    // Remove a dot-notation key from an object (best-effort, leaves empty parent objects in place)
    private removeNested(obj: any, dottedKey: string): void {
      if (!obj) return;
      const parts = String(dottedKey).split('.');
      let cursor = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (cursor[p] == null || typeof cursor[p] !== 'object') return; // nothing to remove
        cursor = cursor[p];
      }
      delete cursor[parts[parts.length - 1]];
    }

    private resolveBrandingId(branding: BrandingModel | string | any): string {
      if (!branding) return 'global';
      if (typeof branding === 'string') return branding;
      if (branding.id) return String(branding.id);
      if (branding._id) return String(branding._id);
      return String(branding);
    }

    private buildUid(branding: BrandingModel, locale: string, namespace: string, key: string): string {
      const brandingPart = this.resolveBrandingId(branding);
      const ns = namespace || 'translation';
      return `${brandingPart}:${locale}:${ns}:${key}`;
    }

    public async getEntry(branding: BrandingModel, locale: string, namespace: string, key: string): Promise<any | null> {
      const uid = this.buildUid(branding, locale, namespace, key);
      return await I18nTranslation.findOne({ uid });
    }

    public async setEntry(
      branding: BrandingModel,
      locale: string,
      namespace: string,
      key: string,
      value: any,
      options?: { bundleId?: string; category?: string; description?: string; noReload?: boolean }
    ): Promise<any> {
      const brandingId = this.resolveBrandingId(branding);
      const existing = await this.getEntry(branding, locale, namespace, key);
      const updates: any = {
        value,
        branding: brandingId,
        locale,
        namespace,
        key
      };
      if (options?.bundleId) updates.bundle = options.bundleId;
      if (options?.category !== undefined) updates.category = options.category;
      if (options?.description !== undefined) updates.description = options.description;

      const saved = existing
        ? await I18nTranslation.updateOne({ id: existing.id }).set(updates)
        : await I18nTranslation.create(updates);

      // Keep I18nBundle.data in sync for this branding/locale/namespace
      try {
        let bundle = await this.getBundle(branding, locale, namespace);
        if (!bundle) {
          // Create a minimal bundle containing this key
          const data = this.unflatten({ [key]: value });
          bundle = await I18nBundle.create({ data, branding: brandingId, locale, namespace });
          // Backfill the entry's bundle relation if not set via options
          if (!options?.bundleId && saved?.id) {
            await I18nTranslation.updateOne({ id: saved.id }).set({ bundle: bundle.id });
          }
        } else {
          const data = bundle.data || {};
          this.setNested(data, key, value);
          await I18nBundle.updateOne({ id: bundle.id }).set({ data });
        }
      } catch (e) {
        this.logger.warn('Bundle sync failed for', brandingId, locale, namespace, key, (e as Error)?.message || e);
      }

      // Trigger i18next cache refresh (best-effort) unless suppressed (e.g., batch operations)
      if (!options?.noReload) {
        try { (global as any).TranslationService?.reloadResources?.(brandingId); } catch (_e) { /* ignore */ }
      }
      return saved;
    }

    public async deleteEntry(branding: BrandingModel, locale: string, namespace: string, key: string): Promise<boolean> {
      const brandingId = this.resolveBrandingId(branding);
      const uid = this.buildUid(branding, locale, namespace, key);
      const deleted = await I18nTranslation.destroyOne({ uid });
      // Keep bundle in sync by removing the key path if it exists
      if (deleted) {
        try {
          const bundle = await this.getBundle(branding, locale, namespace);
          if (bundle?.data) {
            this.removeNested(bundle.data, key);
            await I18nBundle.updateOne({ id: bundle.id }).set({ data: bundle.data });
          }
        } catch (e) {
          this.logger.warn('Bundle sync (remove) failed for', brandingId, locale, namespace, key, (e as Error)?.message || e);
        }
      }
      return !!deleted;
    }

    public async listEntries(branding: BrandingModel, locale: string, namespace: string, keyPrefix?: string): Promise<any[]> {
      const brandingId = this.resolveBrandingId(branding);
      const where: any = { branding: brandingId, locale, namespace };
      if (keyPrefix) {
        // Mongo-specific regex for prefix match
        where.key = { startsWith: keyPrefix } as any;
      }
      return await I18nTranslation.find({ where }).sort('key ASC');
    }

    public async getBundle(branding: BrandingModel, locale: string, namespace: string): Promise<any | null> {
      const brandingId = this.resolveBrandingId(branding);
      const uid = `${brandingId}:${locale}:${namespace || 'translation'}`;
      return await I18nBundle.findOne({ uid });
    }

    public async listBundles(branding: BrandingModel): Promise<any[]> {
      const brandingId = this.resolveBrandingId(branding);
      return await I18nBundle.find({ branding: brandingId });
    }

  public async setBundle(
      branding: BrandingModel,
      locale: string,
      namespace: string,
      data: any,
      displayName?: string,
      options?: { splitToEntries?: boolean; overwriteEntries?: boolean }
    ): Promise<any> {
      const brandingId = this.resolveBrandingId(branding);
      
      // Use provided display name or get default for the language
      const finalDisplayName = displayName || await this.getLanguageDisplayName(locale);
      
      const existing = await this.getBundle(branding, locale, namespace);
      let bundle;
      if (existing) {
        bundle = await I18nBundle.updateOne({ id: existing.id }).set({ 
          data, 
          branding: brandingId, 
          locale, 
          namespace,
          displayName: finalDisplayName 
        });
      } else {
        bundle = await I18nBundle.create({ 
          data, 
          branding: brandingId, 
          locale, 
          namespace,
          displayName: finalDisplayName 
        });
      }
      // Always synchronise entries with the saved bundle (force overwrite & prune) to avoid desync.
      try {
        await this.syncEntriesFromBundle(bundle, true /* overwrite */);
      } catch (e) {
        this.logger.warn('Entry sync failed for', brandingId, locale, namespace, (e as Error)?.message || e);
      }
      // After full bundle update & sync, refresh translations
      try { (global as any).TranslationService?.reloadResources?.(brandingId); } catch (_e) { /* ignore */ }
      return bundle;
    }

    public async updateBundleEnabled(
      branding: BrandingModel,
      locale: string,
      namespace: string,
      enabled: boolean
    ): Promise<any> {
      const brandingId = this.resolveBrandingId(branding);
      
      const bundle = await I18nBundle.updateOne({ 
        branding: brandingId, 
        locale, 
        namespace 
      }).set({ enabled });
      
      if (!bundle) {
        throw new Error(`Bundle not found for branding: ${brandingId}, locale: ${locale}, namespace: ${namespace}`);
      }
      
      return bundle;
    }

    public composeNamespace(entries: Array<{ key: string; value: any }>): any {
      const flat: any = {};
      for (const e of entries) {
        flat[e.key] = e.value;
      }
      return this.unflatten(flat);
    }

  public async syncEntriesFromBundle(bundleOrId: any, overwrite = false): Promise<void> {
      const bundle = isBundle(bundleOrId)
        ? bundleOrId
        : await I18nBundle.findOne({ id: bundleOrId });
      if (!bundle) throw new Error('Bundle not found');

      const { branding, locale, namespace, id: bundleId } = bundle;
      const brandingId = this.resolveBrandingId(branding as any);
      const data = bundle.data || {};
      
      // Load centralized metadata
      const centralizedMeta = await this.loadCentralizedMeta();
      
      // Extract optional metadata map at root level: { [keyPath]: { category?, description? } }
      // File-specific _meta overrides centralized meta
      const fileMeta: Record<string, { category?: string; description?: string }> = (data && typeof data._meta === 'object') ? data._meta : {};
      
      // Merge centralized meta with file-specific meta (file-specific takes precedence)
      const meta = { ...centralizedMeta, ...fileMeta };

      // Flatten the data then strip any _meta entries
      const flatAll = this.flatten(data || {});
      const flat: Record<string, any> = {};
      Object.keys(flatAll).forEach(k => {
        if (k === '_meta' || k.startsWith('_meta.')) return; // skip meta keys
        flat[k] = flatAll[k];
      });
      const keys = Object.keys(flat);

      // Ensure we have a BrandingModel for downstream calls
      const brandingModel: BrandingModel = (BrandingService.getBrandById(brandingId)
        || BrandingService.getBrand?.(brandingId)
        || ({ id: brandingId } as BrandingModel));

      // Track existing keys to detect removals
      const existingEntries = await I18nTranslation.find({ branding: brandingId, locale, namespace });
      const existingKeysSet = new Set(existingEntries.map(e => e.key));

      for (const key of keys) {
        let val = flat[key];
        existingKeysSet.delete(key); // still present
        const existing = await this.getEntry(brandingModel, locale, namespace, key);

        if (existing && !overwrite) continue;

        try {
          if(val === '' || val === null || val === undefined) {
            val = key; // default empty values to the key itself
          }
          await this.setEntry(brandingModel, locale, namespace, key, val, { bundleId, category: meta?.[key]?.category, description: meta?.[key]?.description, noReload: true });
        } catch (e) {
          throw e;
        }
      }
  for (const obsoleteKey of existingKeysSet) {
        try {
  await this.deleteEntry(brandingModel, locale, namespace, String(obsoleteKey));
        } catch (e) {
          this.logger.warn('Failed to prune obsolete key', obsoleteKey, (e as Error)?.message || e);
        }
      }
  // Bulk operation complete; reload once
  try { (global as any).TranslationService?.reloadResources?.(brandingId); } catch (_e) { /* ignore */ }
    }


    /**
    * Load centralized metadata from language-defaults/meta.json.
    * This metadata provides additional context and information about 
    * the translation keys and their usage, and is only used for 
    * bootstrapping default values into the database.
    *
    * The file itself is fairly large, so instead of storing it in 
    * `sails.config.[...]` for the lifetime of the app, it is read 
    * directly from disk at the time it is needed.
    *
    * See README for more details on how this file is used.
    */
    public async loadCentralizedMeta(): Promise<Record<string, any>> {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        
        const metaPath = path.join(sails.config.appPath, 'language-defaults', 'meta.json');
        if (fs.existsSync(metaPath)) {
          const metaContent = fs.readFileSync(metaPath, 'utf8');
          return JSON.parse(metaContent);
        }
        return {};
      } catch (e) {
        this.logger.warn('Error loading meta.json:', (e as Error)?.message || e);
        return {};
      }
    }

    /**
     * Load language display names from language-defaults/language-names.json
     */
    public async loadLanguageNames(): Promise<Record<string, string>> {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        
        const namesPath = path.join(sails.config.appPath, 'language-defaults', 'language-names.json');
        if (fs.existsSync(namesPath)) {
          const namesContent = fs.readFileSync(namesPath, 'utf8');
          return JSON.parse(namesContent);
        }
        return {};
      } catch (e) {
        this.logger.warn('Error loading language-names.json:', (e as Error)?.message || e);
        return {};
      }
    }

    /**
     * Get display name for a language locale
     */
    public async getLanguageDisplayName(locale: string): Promise<string> {
      const languageNames = await this.loadLanguageNames();
      return languageNames[locale] || locale; // fallback to locale code if name not found
    }
  }
}

module.exports = new Services.I18nEntries().exports();
