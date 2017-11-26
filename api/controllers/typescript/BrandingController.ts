import controller = require('../../../typescript/controllers/CoreController.js');
import skipperGridFs = require('skipper-gridfs');
import {Model} from "sails";
import {Sails} from "sails";
import { Observable } from 'rxjs/Rx';
import 'rxjs/add/operator/toPromise';
import * as request from "request-promise";
import * as ejs from 'ejs';
import * as fs from 'graceful-fs';


declare var sails: Sails;
declare var BrandingConfig: Model;
/**
 * Package that contains all Controllers.
 */
export module Controllers {

  export class Branding extends controller.Controllers.Core.Controller {

    private blobAdapter = skipperGridFs({
      host: sails.config.connections.mongodb.host,
      port: sails.config.connections.mongodb.port,
      user: sails.config.connections.mongodb.user,
      password: sails.config.connections.mongodb.password,
      dbname: sails.config.connections.mongodb.database
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
      }).exec(function(err, theme) {
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
      var fd = req.param("branding") + "/logo.png"; // Branding parameter comes from routes.js
      this.blobAdapter.read(fd, function(error, file) {
        if (error) {
          res.sendfile(sails.config.appPath + "/assets/images/logo.png");
        } else {
          res.contentType('image/png');
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
