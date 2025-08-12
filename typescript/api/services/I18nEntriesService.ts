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
     * Seed default i18n bundles into DB from assets/locales for the default brand.
     * - Only creates bundles if none exist (no overwrite).
     */
    public async bootstrap(): Promise<void> {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const supported: string[] = (sails?.config?.i18n?.next?.init?.supportedLngs as string[]) || ['en'];
        const namespaces: string[] = (sails?.config?.i18n?.next?.init?.ns as string[]) || ['translation'];

        // Default brand
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defaultBrand: any = BrandingService.getBrand('default');
        const brandingId = defaultBrand?.id || 'default';

        const localesDir = path.join(sails.config.appPath, 'assets', 'locales');
        for (const lng of supported) {
          for (const ns of namespaces) {
            try {
              // Skip if bundle already exists
              const existing = await this.getBundle(brandingId, lng, ns);
              if (existing) continue;

              const filePath = path.join(localesDir, lng, `${ns}.json`);
              if (fs.existsSync(filePath)) {
                const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                await this.setBundle(brandingId, lng, ns, json, { splitToEntries: true, overwriteEntries: false });
                sails.log.verbose(`[I18nEntriesService.bootstrap] Seeded bundle ${brandingId}:${lng}:${ns}`);
              }
            } catch (e) {
              sails.log.verbose('[I18nEntriesService.bootstrap] Skipping seed for', lng, ns, 'due to error:', (e as Error)?.message || e);
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

    private buildBrandingPart(branding?: string | BrandingModel | null): string {
      if (!branding) return 'global';
      if (typeof branding === 'string') return branding; // assume id
      return branding.id || 'global';
    }

    private buildUid(branding: string | BrandingModel | null, locale: string, namespace: string, key: string): string {
      const brandingPart = this.buildBrandingPart(branding);
      const ns = namespace || 'translation';
      return `${brandingPart}:${locale}:${ns}:${key}`;
    }

    public async getEntry(branding: string | BrandingModel | null, locale: string, namespace: string, key: string): Promise<any | null> {
      const uid = this.buildUid(branding, locale, namespace, key);
      return await I18nTranslation.findOne({ uid });
    }

    public async setEntry(branding: string | BrandingModel | null, locale: string, namespace: string, key: string, value: any, bundleId?: string): Promise<any> {
      const brandingId = this.buildBrandingPart(branding);
      const existing = await this.getEntry(brandingId, locale, namespace, key);
      if (existing) {
        return await I18nTranslation.updateOne({ id: existing.id }).set({ value, branding: brandingId, locale, namespace, key, bundle: bundleId });
      } else {
        return await I18nTranslation.create({ value, branding: brandingId, locale, namespace, key, bundle: bundleId });
      }
    }

    public async deleteEntry(branding: string | BrandingModel | null, locale: string, namespace: string, key: string): Promise<boolean> {
      const brandingId = this.buildBrandingPart(branding);
      const uid = this.buildUid(brandingId, locale, namespace, key);
      const deleted = await I18nTranslation.destroyOne({ uid });
      return !!deleted;
    }

    public async listEntries(branding: string | BrandingModel | null, locale: string, namespace: string, keyPrefix?: string): Promise<any[]> {
      const brandingId = this.buildBrandingPart(branding);
      const where: any = { branding: brandingId, locale, namespace };
      if (keyPrefix) {
        // Mongo-specific regex for prefix match
        where.key = { startsWith: keyPrefix } as any;
      }
      return await I18nTranslation.find({ where }).sort('key ASC');
    }

    public async getBundle(branding: string | BrandingModel | null, locale: string, namespace: string): Promise<any | null> {
      const brandingId = this.buildBrandingPart(branding);
      const uid = `${brandingId}:${locale}:${namespace || 'translation'}`;
      return await I18nBundle.findOne({ uid });
    }

    public async setBundle(branding: string | BrandingModel | null, locale: string, namespace: string, data: any, options?: { splitToEntries?: boolean; overwriteEntries?: boolean }): Promise<any> {
      const brandingId = this.buildBrandingPart(branding);
      const existing = await this.getBundle(brandingId, locale, namespace);
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
  const flat = this.flatten(bundle.data || {});
      const keys = Object.keys(flat);

      for (const key of keys) {
        const val = flat[key];
        const existing = await this.getEntry(branding, locale, namespace, key);
        if (existing && !overwrite) {
          continue;
        }
        await this.setEntry(branding, locale, namespace, key, val, bundleId);
      }
    }
  }
}

module.exports = new Services.I18nEntries().exports();
