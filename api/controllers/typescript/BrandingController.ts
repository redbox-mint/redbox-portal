import controller = require('../../../typescript/controllers/CoreController.js');
import skipperGridFs = require('skipper-gridfs');
import {Model} from "sails";
import {Sails} from "sails";


declare var sails: Sails;
declare var BrandingConfig: Model;
/**
 * Package that contains all Controllers.
 */
export module Controllers {

  export class Branding extends controller.Controllers.Core.Controller {

    private blobAdapter = skipperGridFs({
      host: 'mongodb',
      port: 27017,
      user: '',
      password: '',
      dbname: 'rds-dlcf-portal'
    });
    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'renderCss',
      'renderImage',
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
