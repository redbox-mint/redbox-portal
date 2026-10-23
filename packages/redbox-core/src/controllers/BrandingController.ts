import { BrandingDelivery } from '../http/express/brandingDelivery';
import { getBrandingRepository } from '../persistence/runtime';
import { Controllers as controllers } from '../CoreController';
import * as BrandingServiceModule from '../services/BrandingService';
import * as BrandingLogoServiceModule from '../services/BrandingLogoService';
import * as BrandingThemeCssServiceModule from '../services/BrandingThemeCssService';
import { mapBrandingError } from './BrandingControllerSupport';

// sails is declared globally via sails.ts. Branding persistence uses the B-owned operations.
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const BrandingLogoService: BrandingLogoServiceModule.Services.BrandingLogo;
declare const BrandingThemeCssService: BrandingThemeCssServiceModule.Services.BrandingThemeCss;

export namespace Controllers {
  export class Branding extends controllers.Core.Controller {
    private ownedDelivery?: BrandingDelivery;
    private get delivery() {
      return (this.ownedDelivery ??= new BrandingDelivery({
        repository: getBrandingRepository,
        get theme() {
          return BrandingThemeCssService;
        },
        get typeface() {
          return BrandingTypefaceService;
        },
        get logos() {
          return BrandingLogoService;
        },
        get branding() {
          return BrandingService;
        },
        log: sails.log,
        staticAssets: sails.config.static_assets,
        sendAsset: (res, name) => res.sendFile(sails.config.appPath + '/assets/' + name),
      }));
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'init',
      'renderCss',
      'renderFont',
      'renderImage',
      'renderFavicon',
      'renderApiB',
      'renderSwaggerJSON',
      'renderSwaggerYAML',
      'renderPreviewCss',
      'createPreview',
    ];

    public init() {
      return;
    }

    /**
     * Checks the mongodb for configured CSS for the branding
     * If none is present, it returns the default empty CSS.
     *
     * @param req
     * @param res
     */
    public async renderCss(req: Sails.Req, res: Sails.Res) {
      return this.delivery.renderCss(req, res as unknown as import('express').Response);
    }

    /** Serve temporary preview CSS using BrandingService preview token (/:branding/:portal/preview/:token.css) */
    public async renderPreviewCss(req: Sails.Req, res: Sails.Res) {
      return this.delivery.renderPreviewCss(req, res as unknown as import('express').Response);
    }

    /** Create a preview token (JSON) for a caller-supplied draft revision (legacy public surface) */
    public async createPreview(req: Sails.Req, res: Sails.Res) {
      try {
        const branding = req.param('branding');
        const portal = req.param('portal');
        const brand = await getBrandingRepository().getBrand({ name: branding });
        if (!brand) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ code: 'branding-not-found', detail: 'branding-not-found' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        // The caller may bind the preview to its own draft revision; a concurrent
        // draft change surfaces as 409 instead of previewing a torn state. Keep
        // the legacy no-body form working by binding it to the revision read
        // above before the service re-checks the brand.
        const body = (req.body ?? {}) as Record<string, unknown>;
        const expectedDraftRevision =
          body.expectedDraftRevision === undefined
            ? typeof brand.draftRevision === 'number'
              ? brand.draftRevision
              : 0
            : (body.expectedDraftRevision as number | undefined);
        const result = await BrandingService.preview(branding, portal, expectedDraftRevision);
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (e: unknown) {
        const mapped = mapBrandingError(e);
        return this.sendResp(req, res, {
          status: mapped.status,
          displayErrors: [{ code: mapped.code, detail: mapped.detail }],
          ...(mapped.current ? { data: { current: mapped.current } } : {}),
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    /**
     * Serves one immutable Brand Typeface face by exact brand name and content hash
     * (GET|HEAD /fonts/branding/:branding/:sha256.woff2).
     *
     * Portal-independent and sessionless so every portal under a brand shares the
     * browser cache. Missing brands/objects and hash mismatches are 404 without
     * substituting another font; corruption is logged server-side.
     */
    public async renderFont(req: Sails.Req, res: Sails.Res) {
      return this.delivery.renderFont(req, res as unknown as import('express').Response);
    }

    /**
     *
     * Renders the API Blueprint spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderApiB(req: Sails.Req, res: Sails.Res) {
      return this.delivery.renderApiB(req, res as unknown as import('express').Response);
    }

    /**
     *
     * Renders the Swagger JSON spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderSwaggerJSON(req: Sails.Req, res: Sails.Res) {
      return this.delivery.renderSwaggerJSON(req, res as unknown as import('express').Response);
    }

    /**
     *
     * Renders the Swagger JSON spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderSwaggerYAML(req: Sails.Req, res: Sails.Res) {
      return this.delivery.renderSwaggerYAML(req, res as unknown as import('express').Response);
    }

    /**
     * Checks the mongodb for configured CSS for the branding
     * If none is present, it returns the default empty CSS.
     *
     * @param req
     * @param res
     */
    public async renderImage(req: Sails.Req, res: Sails.Res) {
      return this.delivery.renderImage(req, res as unknown as import('express').Response);
    }

    /**
     * Serves the per-brand favicon from storage, falling back to the static
     * default favicon when no custom favicon has been configured.
     *
     * @param req
     * @param res
     */
    public async renderFavicon(req: Sails.Req, res: Sails.Res) {
      return this.delivery.renderFavicon(req, res as unknown as import('express').Response);
    }
  }
}
