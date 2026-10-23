import { Services as Owned, brandingExportedMethods } from '../../branding/Branding';
import type { CacheEntryRepository } from '../../persistence/cache/CacheEntryRepository';
import { getCacheEntryRepository } from '../../persistence/cache/runtime';
import { getBrandingRepository } from '../../persistence/runtime';
import { getBrandingPositiveInt } from '../../config/branding.config';
import { BrandingModel } from '../../model/storage/BrandingModel';
import _ from 'lodash';
export * from '../../branding/Branding';
export namespace Services {
  export class Branding extends Owned.Branding {
    constructor(cacheEntries: () => CacheEntryRepository = () => getCacheEntryRepository()) {
      super({
        get repository() {
          return getBrandingRepository();
        },
        cacheEntries,
        get log() {
          return sails.log;
        },
        get theme() {
          return BrandingThemeCssService;
        },
        get typeface() {
          return BrandingTypefaceService;
        },
        positiveInt: getBrandingPositiveInt,
        get rootContext() {
          return sails.config.http.rootContext;
        },
        get previewTtlSeconds() {
          return Reflect.get(sails.config.branding, 'previewTtlSeconds') as number | undefined;
        },
      });
      this._exportedMethods = [
        ...brandingExportedMethods,
        'getBrandAndPortalPath',
        'getFaviconUrl',
        'getBrandNameFromReq',
        'getBrandFromReq',
        'getPortalFromReq',
        'getFullPath',
        'getRootContext',
      ];
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

    public getFaviconUrl(req: Sails.ReqParamProvider): string {
      return `${this.getBrandAndPortalPath(req)}/images/favicon`;
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

    exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing branding operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }
  }
}

const key = Symbol.for('@researchdatabox/redbox-core/comparison/Branding');
export function sailsBrandingExports(): Record<string, unknown> {
  const methods = brandingExportedMethods.concat([
    'getBrandAndPortalPath',
    'getFaviconUrl',
    'getBrandNameFromReq',
    'getBrandFromReq',
    'getPortalFromReq',
    'getFullPath',
    'getRootContext',
  ]);
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as Services.Branding | undefined;
        if (!instance) {
          instance = new Services.Branding();
          Object.defineProperty(sails, key, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing branding operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
