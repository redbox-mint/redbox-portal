import { Controllers as controllers} from '@researchdatabox/redbox-core-types';
import skipperGridFs from "skipper-gridfs";
import {Model} from "sails";
import {Sails} from "sails";
import {Observable} from 'rxjs/Rx';
import 'rxjs/add/operator/toPromise';
import * as ejs from 'ejs';
import * as fs from 'graceful-fs';
import path from "path";


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
      'renderSwaggerYAML'
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
    public renderCss(req, res) {
      BrandingConfig.findOne({
        "name": req.param('branding')
      }).exec(function (err, theme) {
        res.set('Content-Type', 'text/css');
        if (theme != null) {
          return res.send(theme['css']);
        } else {
          return res.send("/* Using the default theme */");
        }
      });
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
      return this.sendView(req, res, "apidocsapib", {layout: false});
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
      return this.sendView(req, res, "apidocsswaggerjson", {layout: false});
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
      return this.sendView(req, res, "apidocsswaggeryaml", {layout: false});
    }

    /**
     * Checks the mongodb for configured CSS for the branding
     * If none is present, it returns the default empty CSS.
     *
     * @param req
     * @param res
     */
    public renderImage(req, res) {
      sails.log.verbose(`current config for image is:`);
      sails.log.verbose(JSON.stringify(sails.config.static_assets));
      var fd = path.join(req.param("branding"), req.param("portal"), 'images', sails.config.static_assets.logoName); // Branding parameter comes from routes.js
      sails.log.info(`Trying to read file descriptor: ${fd}`);
      this.blobAdapter.read(fd, function (error, file) {
        if (error) {
          sails.log.warn(`There was an error reading ${fd}. Sending back /assets/images/${sails.config.static_assets.logoName}`);
          res.contentType(sails.config.static_assets.imageType);
          res.sendFile(sails.config.appPath + `/assets/images/${sails.config.static_assets.logoName}`);
        } else {
          res.contentType(sails.config.static_assets.imageType);
          res.send(new Buffer(file));
        }
      });
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Branding().exports();
