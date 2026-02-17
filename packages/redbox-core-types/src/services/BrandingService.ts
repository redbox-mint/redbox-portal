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

import { Observable, of, throwError } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { BrandingConfigHistoryAttributes } from '../waterline-models/BrandingConfigHistory';
import * as crypto from 'crypto';


export namespace Services {
  /**
   * Branding related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Branding extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'loadAvailableBrands',
      'getDefault',
      'getBrand',
      'getAvailable',
      'getBrandAndPortalPath',
      'getBrandNameFromReq',
      'getBrandFromReq',
      'getPortalFromReq',
      'getFullPath',
      'getRootContext',
      'getBrandById',
      'getBrandingFromDB',
      'saveDraft',
      'preview',
      'fetchPreview',
      'publish',
      'rollback',
      'refreshBrandingCache'
    ];

    protected availableBrandings: string[] = []
    protected brandings: BrandingModel[] = []
    protected dBrand = { name: 'default' };

    public bootstrap = (): Observable<BrandingModel> => {
      return super.getObservable(BrandingConfig.findOne(this.dBrand))
        .pipe(flatMap(defaultBrand => {
          if (_.isEmpty(defaultBrand)) {
            // create default brand
            sails.log.verbose("Default brand doesn't exist, creating...");
            return super.getObservable(BrandingConfig.create(this.dBrand))
          }
          sails.log.verbose("Default brand already exists...");
          return of(defaultBrand);
        })
          , flatMap(this.loadAvailableBrands));
    }

    public loadAvailableBrands = (_defBrand: unknown): Observable<BrandingModel> => {
      sails.log.verbose("Loading available brands......");
      // Find all the BrandingConfig we have and add them to the availableBrandings array.
      // A policy is configured to reject any branding values not present in this array.
      return super.getObservable(BrandingConfig.find({}).populate('roles'))
        .pipe(flatMap(brands => {
          this.brandings = brands as BrandingModel[];
          this.availableBrandings = _.map(this.brandings, 'name');
          const defBrandEntry: BrandingModel = this.getDefault();
          if (defBrandEntry == null) {
            sails.log.error("Failed to load default brand!");
            return throwError(new Error("Failed to load default brand!"));
          }
          return of(defBrandEntry);
        }));
    }

    public getDefault = (): BrandingModel => {
      return _.find(this.brandings, (o: BrandingModel) => { return o.name == this.dBrand.name }) as BrandingModel;
    }

    public getBrand = (name: string): BrandingModel => {
      return _.find(this.brandings, (o: BrandingModel) => { return o.name == name }) as BrandingModel;
    }

    public getBrandById = (id: string): BrandingModel => {
      return _.find(this.brandings, (o: BrandingModel) => { return o.id == id }) as BrandingModel;
    }

    public async getBrandingFromDB(name: string): Promise<BrandingModel> {
      return BrandingConfig.findOne({ name: name }) as unknown as BrandingModel;
    }

    public getAvailable = (): string[] => {
      return this.availableBrandings;
    }

    public getBrandAndPortalPath(req: Sails.ReqParamProvider): string {
      const branding = this.getBrandNameFromReq(req);
      const portal = this.getPortalFromReq(req);
      const rootContext = this.getRootContext();
      if (_.isEmpty(rootContext)) {
        return `/${branding}/${portal}`;
      } else {
        return `${rootContext}/${branding}/${portal}`;
      }
    }

    public getRootContext(): string {

      const rootContext = sails.config.http.rootContext;
      if (_.isEmpty(rootContext)) {
        return ``;
      } else {
        return `/${rootContext}`;
      }
    }


    public getFullPath(req: Sails.ReqParamProvider): string {
      return sails.config.appUrl + this.getBrandAndPortalPath(req);
    }

    public getBrandNameFromReq(req: Sails.ReqParamProvider): string {
      let branding = null;
      if (req && req.params) {
        const paramBranding = req.params['branding'];
        branding = typeof paramBranding === 'string' ? paramBranding : null;
      }
      if (branding == null && req) {
        if (req.body != null) {
          const bodyBranding = req.body.branding;
          branding = typeof bodyBranding === 'string' ? bodyBranding : null;
        }
      }
      if (branding == null && req) {
        if (req.session != null) {
          const sessionBranding = req.session.branding;
          branding = typeof sessionBranding === 'string' ? sessionBranding : null;
        }
      }
      if (branding == null) {
        branding = sails.config.auth.defaultBrand;
      }

      return branding;
    }

    public getBrandFromReq(req: Sails.ReqParamProvider): BrandingModel {
      return this.getBrand(this.getBrandNameFromReq(req));
    }

    public getPortalFromReq(req: Sails.ReqParamProvider): string {
      let portal = null;
      if (req && req.params) {
        const paramPortal = req.params['portal'];
        portal = typeof paramPortal === 'string' ? paramPortal : null;
      }
      if (portal == null && req) {
        if (req.body != null) {
          const bodyPortal = req.body.portal;
          portal = typeof bodyPortal === 'string' ? bodyPortal : null;
        }
      }
      if (portal == null && req) {
        if (req.session != null) {
          const sessionPortal = req.session.portal;
          portal = typeof sessionPortal === 'string' ? sessionPortal : null;
        }
      }
      if (portal == null) {
        portal = sails.config.auth.defaultPortal;
      }

      return portal;
    }

    /** Save draft variables after whitelist + contrast validation */
    public async saveDraft(input: { branding: string; variables: Record<string, string>; actor?: unknown; }): Promise<BrandingModel | null> {
      const whitelist: string[] = _.get(sails, 'config.branding.variableAllowList', []) || [];
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.variables || {})) {
        const norm = k.startsWith('$') ? k.slice(1) : k;
        if (!whitelist.includes(norm)) {
          throw new Error('Invalid variable key: ' + norm);
        }
        normalized[norm] = v;
      }
      // Contrast validation: only enforce on pairs where both fg/bg provided in this input.
      const colorKeysInInput = new Set<string>(Object.keys(normalized));
      const contrastPairKeyMap: Record<string, [string, string]> = {
        'primary-text-on-primary-bg': ['primary-text-color', 'primary-color'],
        'secondary-text-on-secondary-bg': ['secondary-text-color', 'secondary-color'],
        'accent-text-on-accent-bg': ['accent-text-color', 'accent-color'],
        'body-text-on-surface': ['body-text-color', 'surface-color'],
        'heading-text-on-surface': ['heading-text-color', 'surface-color']
      };
      const relevantPairProvided = Object.values(contrastPairKeyMap).some(([a, b]) => colorKeysInInput.has(a) && colorKeysInInput.has(b));
      if (relevantPairProvided) {
        const contrast = await ContrastService.validate(normalized);
        const filteredViolations = contrast.violations.filter(v => {
          const keys = contrastPairKeyMap[v.pair];
          return keys && keys.every(k => colorKeysInInput.has(k));
        });
        if (filteredViolations.length) {
          throw new Error('contrast-violation: ' + filteredViolations.map(v => v.pair).join(','));
        }
      }
      const brand = await BrandingConfig.findOne({ name: input.branding });
      if (!brand) throw new Error('branding-not-found');
      await BrandingConfig.update({ id: brand.id }, { variables: normalized });
      const updated = await this.refreshBrandingCache(brand.id);
      return updated;
    }

    /** Generate preview token storing compiled CSS in CacheEntry */
    public async preview(branding: string, portal: string): Promise<{ token: string; url: string; hash: string; }> {
      const brand = await BrandingConfig.findOne({ name: branding });
      if (!brand) throw new Error('branding-not-found');
      const { css, hash } = await SassCompilerService.compile(brand.variables || {});
      const token = crypto.randomBytes(16).toString('hex');
      const name = `branding-preview:${token}`;
      const ts = Math.floor(Date.now() / 1000);
      await CacheEntry.create({ name, data: { css, branding, portal, hash }, ts_added: ts });
      const url = `/${branding}/${portal}/preview/${token}.css`;
      return { token, url, hash };
    }

    /** Fetch preview CSS (helper for tests); enforces TTL */
    public async fetchPreview(token: string): Promise<{ css: string; branding: string; portal: string; hash: string; }> {
      const ttl = _.get(sails, 'config.branding.previewTtlSeconds', 300);
      const name = `branding-preview:${token}`;
      const entry = await CacheEntry.findOne({ name });
      if (!entry) throw new Error('preview-not-found');
      const age = Math.floor(Date.now() / 1000) - entry.ts_added;
      if (age > ttl) {
        await CacheEntry.destroy({ id: entry.id });
        throw new Error('preview-expired');
      }
      // Single-use: destroy after first successful fetch
      await CacheEntry.destroy({ id: entry.id });
      return entry.data as { css: string; branding: string; portal: string; hash: string; };
    }

    /** Publish current draft (variables) -> CSS, bump version, persist hash, history */
    public async publish(branding: string, portal: string, _actor: unknown, opts?: { expectedVersion?: number; }): Promise<{ version: number; hash: string; idempotent?: boolean; }> {
      const brand = await BrandingConfig.findOne({ name: branding });
      if (!brand) throw new Error('branding-not-found');
      if (opts?.expectedVersion != null && brand.version != null && opts.expectedVersion !== brand.version) {
        throw new Error('publish-conflict');
      }
      const { css, hash } = await SassCompilerService.compile(brand.variables || {});
      // Idempotency: if hash unchanged from last published, do not create new history/version
      if (brand.hash && brand.hash === hash) {
        return { version: brand.version || 0, hash: brand.hash, idempotent: true };
      }
      const newVersion = (brand.version || 0) + 1;
      await BrandingConfig.update({ id: brand.id }, { css, hash, version: newVersion });
      await BrandingConfigHistory.create({ branding: brand.id, version: newVersion, hash, css, variables: brand.variables });
      await this.refreshBrandingCache(brand.id);
      return { version: newVersion, hash };
    }

    /** Rollback to a previous published version via history id */
    public async rollback(historyId: string, _actor: unknown): Promise<{ version: number; hash: string; branding: BrandingModel | null; }> {
      const historyEntry = await BrandingConfigHistory.findOne({ id: historyId }).populate('branding') as unknown as BrandingConfigHistoryAttributes | null;
      if (!historyEntry) throw new Error('history-not-found');
      const branding = historyEntry.branding as unknown as BrandingModel | null;
      if (!branding) throw new Error('branding-not-found');

      // Restore variables, CSS, hash from history
      await BrandingConfig.update({ id: (branding as BrandingModel).id }, {
        variables: historyEntry.variables,
        css: historyEntry.css,
        hash: historyEntry.hash,
        version: historyEntry.version
      });
      const refreshed = await this.refreshBrandingCache((branding as BrandingModel).id);
      return {
        version: historyEntry.version,
        hash: historyEntry.hash,
        branding: refreshed
      };
    }

    /** Refresh a single branding record in the in-memory cache (this.brandings & availableBrandings) */
    public async refreshBrandingCache(id: string): Promise<BrandingModel | null> {
      const updated = await BrandingConfig.findOne({ id }).populate('roles') as unknown as BrandingModel | null;
      if (updated) {
        const idx = this.brandings.findIndex((b: BrandingModel) => b.id === id);
        if (idx >= 0) {
          this.brandings[idx] = updated;
        } else {
          this.brandings.push(updated);
        }
        this.availableBrandings = _.map(this.brandings, 'name');
      }
      return updated;
    }

  }

}

declare global {
  let BrandingService: Services.Branding;
}
