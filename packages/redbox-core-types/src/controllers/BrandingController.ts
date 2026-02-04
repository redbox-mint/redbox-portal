import { Controllers as controllers } from '../CoreController';
import * as BrandingServiceModule from '../services/BrandingService';
import * as BrandingLogoServiceModule from '../services/BrandingLogoService';
import * as crypto from 'crypto';
import * as fs from 'graceful-fs';
import * as path from 'path';

declare const sails: any;
declare const BrandingConfig: any;
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const BrandingLogoService: BrandingLogoServiceModule.Services.BrandingLogo;

export module Controllers {

  export class Branding extends controllers.Core.Controller {
    private mongoUri!: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private blobAdapter: any;

    /**
     * Generate a weak ETag for the given content hash or string.
     * @param hashOrContent - Either a pre-computed hash string or content to hash
     * @param prefix - Optional prefix for the ETag (e.g., 'logo-', 'preview-')
     * @returns ETag string in format 'W/"[prefix]hash"'
     */
    private generateETag(hashOrContent: string, prefix: string = ''): string {
      let hash: string;
      // If it looks like a hex hash (lowercase hex chars), use it directly
      if (/^[a-f0-9]+$/.test(hashOrContent)) {
        hash = hashOrContent;
      } else {
        // Otherwise compute SHA256 hash of the content
        hash = crypto.createHash('sha256').update(hashOrContent).digest('hex');
      }
      return `W/"${prefix}${hash}"`;
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
      'init',
      'renderCss',
      'renderImage',
      'renderApiB',
      'renderSwaggerJSON',
      'renderSwaggerYAML',
      'renderPreviewCss',
      'createPreview'
    ];

    public init() {
      this.mongoUri = sails.config.datastores.mongodb.url;
      const skipperGridFs = require('skipper-gridfs');
      this.blobAdapter = skipperGridFs({
        uri: this.mongoUri
      });
    }

    /**
     * Checks the mongodb for configured CSS for the branding
     * If none is present, it returns the default empty CSS.
     *
     * @param req
     * @param res
     */
    public async renderCss(req, res) {
      try {
        const branding = req.param('branding');
        const brand = await BrandingConfig.findOne({ name: branding });
        res.set('Content-Type', 'text/css');
        // If brand (or css) not present, serve the pre-compiled default CSS
        if (!brand || !brand.css) {
          const defaultCssPath = path.join(sails.config.appPath, '.tmp/public/default/default/styles/style.min.css');
          try {
            const css = fs.readFileSync(defaultCssPath, 'utf8');
            const etag = this.generateETag(css);
            res.set('ETag', etag);
            if (req.headers['if-none-match'] === etag) {
              return res.status(304).end();
            }
            res.set('Cache-Control', 'public, max-age=300'); // Cache default CSS longer
            return res.send(css);
          } catch (fsError) {
            // Fallback to minimal CSS if default file cannot be read
            const css = ':root{}';
            const etag = this.generateETag(css);
            res.set('ETag', etag);
            if (req.headers['if-none-match'] === etag) {
              return res.status(304).end();
            }
            res.set('Cache-Control', 'public, max-age=60');
            return res.send(css);
          }
        }
        // Ensure hash is lowercase hex; fall back to sha256 hex of css if stored hash is missing or not hex.
        const safeHash = (brand.hash && /^[a-f0-9]+$/.test(brand.hash)) ? brand.hash : crypto.createHash('sha256').update(brand.css).digest('hex');
        const etag = this.generateETag(safeHash);
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }
        res.set('Cache-Control', 'public, max-age=300');
        return res.send(brand.css);
      } catch (e) {
        sails.log.error('Error serving CSS:', e);
        res.status(500).send('/* error serving theme */');
      }
    }

    /** Serve temporary preview CSS using BrandingService preview token (/:branding/:portal/preview/:token.css) */
    public async renderPreviewCss(req, res) {
      try {
        let token = req.param('token');
        if (!token) {
          const tokenCss = req.param('tokenCss');
          if (tokenCss) {
            token = tokenCss.replace(/\.css$/, '');
          }
        }
        if (!token) {
          return res.status(404).send('/* preview token missing */');
        }

        // Validate token format (e.g., alphanumeric, reasonable length)
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(token)) {
          return res.status(400).send('/* invalid preview token */');
        }

        const data = await BrandingService.fetchPreview(token);
        res.set('Content-Type', 'text/css');
        res.set('Cache-Control', 'no-cache, no-store');
        // Short weak etag for preview hash
        const hash = data.hash || crypto.createHash('sha256').update(data.css).digest('hex');
        const etag = this.generateETag(hash, 'preview-');
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        return res.send(data.css);
      } catch (e) {
        return res.status(404).send('/* preview not found */');
      }
    }

    /** Create a preview token (JSON) */
    public async createPreview(req, res) {
      try {
        const branding = req.param('branding');
        const portal = req.param('portal');
        const result = await BrandingService.preview(branding, portal);
        return res.json(result);
      } catch (e: any) {
        return res.status(500).json({ error: 'preview-error', message: e.message });
      }
    }

    /**
     *
     * Renders the API Blueprint spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderApiB(req, res) {
      res.contentType('text/plain');
      req.options.locals["baseUrl"] = sails.config.appUrl;
      return this.sendView(req, res, "apidocsapib", { layout: false });
    }


    /**
     *
     * Renders the Swagger JSON spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderSwaggerJSON(req, res) {
      res.contentType('application/json');
      req.options.locals["baseUrl"] = sails.config.appUrl;
      return this.sendView(req, res, "apidocsswaggerjson", { layout: false });
    }

    /**
     *
     * Renders the Swagger JSON spec for the given branding
     *
     * @param req
     * @param res
     */
    public renderSwaggerYAML(req, res) {
      res.contentType('application/x-yaml');
      req.options.locals["baseUrl"] = sails.config.appUrl;
      return this.sendView(req, res, "apidocsswaggeryaml", { layout: false });
    }

    /**
     * Checks the mongodb for configured CSS for the branding
     * If none is present, it returns the default empty CSS.
     *
     * @param req
     * @param res
     */
    public async renderImage(req, res) {
      try {
        const branding = req.param('branding');
        const brand = await BrandingConfig.findOne({ name: branding });
        if (!brand || !brand.logo || !brand.logo.gridFsId) {
          // fallback to static
          res.contentType(sails.config.static_assets.imageType);
          return res.sendFile(`${sails.config.appPath}/assets/images/${sails.config.static_assets.logoName}`);
        }
        const id = brand.logo.gridFsId;
        // Try persistent storage first (GridFS), then in-memory cache
        let buf: Buffer | null = null;
        buf = await BrandingLogoService.getBinaryAsync(id);
        
        if (!buf) {
          res.contentType(sails.config.static_assets.imageType);
          return res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
        }
        res.contentType(brand.logo.contentType || sails.config.static_assets.imageType);
        const etag = this.generateETag(brand.logo.sha256, 'logo-');
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(buf);
      } catch (e) {
        res.contentType(sails.config.static_assets.imageType);
        return res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
      }
    }
  }
}
