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

import { Services as services, BrandingModel } from '@researchdatabox/redbox-core-types';
import { Sails, Model } from 'sails';

declare var sails: Sails;
declare var _;

// Waterline globals
declare var I18nTranslation: Model;
declare var I18nBundle: Model;
declare let BrandingService: any;

export module Services {
  /**
   * I18nEntriesService: Manage i18next translations stored in DB.
   * - Per-key entries in I18nTranslation
   * - Whole-namespace bundles in I18nBundle
   */
  export class I18nEntries extends services.Core.Service {
    protected _exportedMethods: any = [
      'getEntry',
      'setEntry',
      'deleteEntry',
      'listEntries',
      'getBundle',
      'setBundle',
      'composeNamespace',
      'syncEntriesFromBundle',
      'bootstrap'
    ];
    
  /**
   * Seed default i18n bundles into DB from language-defaults for the default brand.
   * - Only creates bundles if none exist (no overwrite).
   */
  public async bootstrap(): Promise<void> {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const supported: string[] = (sails?.config?.i18n?.next?.init?.supportedLngs as string[]) || ['en'];
        const namespaces: string[] = (sails?.config?.i18n?.next?.init?.ns as string[]) || ['translation'];

        // Default brand
        const defaultBrand: BrandingModel | null = BrandingService.getBrand('default');
        if (!defaultBrand) {
          sails.log.warn('[I18nEntriesService.bootstrap] Default brand not found, skipping seeding');
          return;
        }

  const localesDir = path.join(sails.config.appPath, 'language-defaults');
        for (const lng of supported) {
          for (const ns of namespaces) {
            try {
              const existing = await this.getBundle(defaultBrand, lng, ns);
              const filePath = path.join(localesDir, lng, `${ns}.json`);
              if (!fs.existsSync(filePath)) {
                continue; // nothing to seed/sync for this pair
              }

              const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

              if (!existing) {
                // First-time seed: create bundle and split to entries (no overwrite)
                await this.setBundle(defaultBrand, lng, ns, json, { splitToEntries: true, overwriteEntries: false });
                sails.log.verbose(`[I18nEntriesService.bootstrap] Seeded bundle ${defaultBrand.id}:${lng}:${ns}`);
              } else {
                // Incremental: add any new keys found in defaults into entries; do not touch bundle data
                await this.syncEntriesFromBundle({ branding: defaultBrand, locale: lng, namespace: ns, id: existing.id, data: json }, false);
                sails.log.verbose(`[I18nEntriesService.bootstrap] Synced new keys for ${defaultBrand.id}:${lng}:${ns}`);
              }
            } catch (e) {
              sails.log.verbose('[I18nEntriesService.bootstrap] Skipping seed/sync for', lng, ns, 'due to error:', (e as Error)?.message || e);
            }
          }
        }
      } catch (err) {
        sails.log.warn('I18nEntriesService.bootstrap failed:', (err as Error)?.message || err);
      }
    }

    // Minimal flatten utility (dot notation) to avoid ESM-only deps
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

    // Minimal unflatten utility for dot-notation keys
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

    private resolveBrandingId(branding: BrandingModel): string {
      return branding?.id || 'global';
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
      options?: { bundleId?: string; category?: string; description?: string }
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
        sails.log.warn('[I18nEntriesService.setEntry] Bundle sync failed for', brandingId, locale, namespace, key, (e as Error)?.message || e);
      }

      return saved;
    }

    public async deleteEntry(branding: BrandingModel, locale: string, namespace: string, key: string): Promise<boolean> {
      const brandingId = this.resolveBrandingId(branding);
      const uid = this.buildUid(branding, locale, namespace, key);
      const deleted = await I18nTranslation.destroyOne({ uid });
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

    public async setBundle(
      branding: BrandingModel,
      locale: string,
      namespace: string,
      data: any,
      options?: { splitToEntries?: boolean; overwriteEntries?: boolean }
    ): Promise<any> {
      const brandingId = this.resolveBrandingId(branding);
      const existing = await this.getBundle(branding, locale, namespace);
      let bundle;
      if (existing) {
        bundle = await I18nBundle.updateOne({ id: existing.id }).set({ data, branding: brandingId, locale, namespace });
      } else {
        bundle = await I18nBundle.create({ data, branding: brandingId, locale, namespace });
      }

      const split = options?.splitToEntries === true;
  if (split) {
        await this.syncEntriesFromBundle(bundle, options?.overwriteEntries === true);
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
      const bundle = _.isString(bundleOrId)
        ? await I18nBundle.findOne({ id: bundleOrId })
        : bundleOrId;
      if (!bundle) throw new Error('Bundle not found');

      const { branding, locale, namespace, id: bundleId } = bundle;
      const data = bundle.data || {};
      // Extract optional metadata map at root level: { [keyPath]: { category?, description? } }
      const meta: Record<string, { category?: string; description?: string }> = (data && typeof data._meta === 'object') ? data._meta : {};

      // Flatten the data then strip any _meta entries
      const flatAll = this.flatten(data || {});
      const flat: Record<string, any> = {};
      Object.keys(flatAll).forEach(k => {
        if (k === '_meta' || k.startsWith('_meta.')) return; // skip meta keys
        flat[k] = flatAll[k];
      });
      const keys = Object.keys(flat);

      // Ensure we have a BrandingModel for downstream calls
      const brandingModel: BrandingModel = (typeof branding === 'string')
        ? (BrandingService.getBrand(branding) || ({ id: branding } as BrandingModel))
        : (branding as BrandingModel);

      for (const key of keys) {
        const val = flat[key];
        const existing = await this.getEntry(brandingModel, locale, namespace, key);
        if (existing && !overwrite) {
          continue;
        }
        await this.setEntry(
          brandingModel,
          locale,
          namespace,
          key,
          val,
          { bundleId, category: meta?.[key]?.category, description: meta?.[key]?.description }
        );
      }
    }
  }
}

module.exports = new Services.I18nEntries().exports();
