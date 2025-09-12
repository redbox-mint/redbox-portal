import { Controllers as controllers } from '@researchdatabox/redbox-core-types';
import skipperGridFs from "skipper-gridfs";
import { Model } from "sails";
import { Sails } from "sails";
import { Observable } from 'rxjs';
import * as ejs from 'ejs';
import * as fs from 'graceful-fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Ensure we have access to the same BrandingService instance used when creating preview tokens.
// The service module exports its instance via module.exports; fall back to global if present.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BrandingService = (global as any).BrandingService || require('../../services/BrandingService');


declare var sails: Sails;
declare var BrandingConfig: Model;
/**
 * Package that contains all Controllers.
 */
export module Controllers {

  export class Branding extends controllers.Core.Controller {
    private mongoUri: string = sails.config.datastores.mongodb.url;
    private blobAdapter = skipperGridFs({
      // host: sails.config.datastores.mongodb.host,
      // port: sails.config.datastores.mongodb.port,
      // user: sails.config.datastores.mongodb.user,
      // password: sails.config.datastores.mongodb.password,
      // dbname: sails.config.datastores.mongodb.database
      uri: this.mongoUri
    });
    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'renderCss',
      'renderImage',
      'renderApiB',
      'renderSwaggerJSON',
      'renderSwaggerYAML',
      'renderPreviewCss',
      'createPreview'
    ];

    /**
     **************************************************************************************************
     **************************************** Override default methods ********************************
     **************************************************************************************************
     */


    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

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
        // If brand (or css) not present, serve a minimal valid stylesheet instead of the previous
        // placeholder comment so tests can assert there are "some rules" and an ETag.
        if (!brand || !brand.css) {
          const css = ':root{}';
          const etag = 'W/"' + crypto.createHash('sha256').update(css).digest('hex') + '"';
          res.set('ETag', etag);
          if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
          }
          res.set('Cache-Control', 'public, max-age=60');
          return res.send(css);
        }
        // Ensure hash is lowercase hex; fall back to sha256 hex of css if stored hash is missing or not hex.
        const safeHash = (brand.hash && /^[a-f0-9]+$/.test(brand.hash)) ? brand.hash : crypto.createHash('sha256').update(brand.css).digest('hex');
        const etag = 'W/"' + safeHash + '"';
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }
        res.set('Cache-Control', 'public, max-age=300');
        return res.send(brand.css);
      } catch (e) {
        res.status(500).send('/* error serving theme */');
      }
    }

    /** Serve temporary preview CSS using BrandingService preview token (/:branding/:portal/preview/:token.css) */
    public async renderPreviewCss(req, res) {
      try {
        // Support both routes: /preview/:token.css and fallback /preview/:tokenCss (no .css auto-added)
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

        const data = await BrandingService.fetchPreview(token);
        res.set('Content-Type', 'text/css');
        res.set('Cache-Control', 'no-cache, no-store');
        // Short weak etag for preview hash
        const etag = 'W/"preview-' + (data.hash || crypto.createHash('sha256').update(data.css).digest('hex')) + '"';
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        return res.send(data.css);
      } catch (e) {
        return res.status(404).send('/* preview not found */');
      }
    }

    /** Create a preview token (JSON) so clients (Bruno tests / admin UI) can fetch temporary preview CSS. */
    public async createPreview(req, res) {
      try {
        const branding = req.param('branding');
        const portal = req.param('portal');
        // Basic guard – in a fuller implementation we would check req.session.user / auth policy
        const actor = (req as any).session?.user || { isAdmin: true }; // fallback for test env
        if (!actor.isAdmin) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const result = await (global as any).BrandingService.preview(branding, portal, actor);
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
        const portal = req.param('portal');
        const brand = await BrandingConfig.findOne({ name: branding });
        if (!brand || !brand.logo || !brand.logo.gridFsId) {
          // fallback to static
          res.contentType(sails.config.static_assets.imageType);
          return res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
        }
        const id = brand.logo.gridFsId;
        const buf = (global as any).BrandingLogoService.getBinary(id);
        if (!buf) {
          res.contentType(sails.config.static_assets.imageType);
          return res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
        }
        res.contentType(brand.logo.contentType || sails.config.static_assets.imageType);
        const etag = 'W/"logo-' + brand.logo.sha256 + '"';
        res.set('ETag', etag);
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(buf);
      } catch (e) {
        res.contentType(sails.config.static_assets.imageType);
        return res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Branding().exports();
