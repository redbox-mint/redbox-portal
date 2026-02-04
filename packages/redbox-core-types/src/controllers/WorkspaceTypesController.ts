import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../index';

declare var sails: any;
declare var _: any;

export module Controllers {
  /**
   * WorkspaceType related methods
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
   */
  export class WorkspaceTypes extends controllers.Core.Controller {

    private blobAdapter: any;

    protected override _exportedMethods: any = [
      'init',
      'get',
      'getOne',
      'uploadLogo',
      'renderImage'
    ];

    public init() {
      const skipperGridFs = require('skipper-gridfs');
      const uriCreds: string = `${sails.config.datastores.mongodb.user}${_.isEmpty(sails.config.datastores.mongodb.password) ? '' : `:${sails.config.datastores.mongodb.password}`}`;
      const uriHost: string = `${sails.config.datastores.mongodb.host}${_.isNull(sails.config.datastores.mongodb.port) ? '' : `:${sails.config.datastores.mongodb.port}`}`;
      const mongoUri: string = `mongodb://${_.isEmpty(uriCreds) ? '' : `${uriCreds}@`}${uriHost}/${sails.config.datastores.mongodb.database}`;
      this.blobAdapter = skipperGridFs({
        uri: mongoUri
      });
    }

    public bootstrap() {
    }

    public get(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      return WorkspaceTypesService.get(brand).subscribe(response => {
        let workspaceTypes = [];
        if (response) {
          workspaceTypes = response.slice();
        }
        this.sendResp(req, res, { data: { status: true, workspaceTypes: workspaceTypes }, headers: this.getNoCacheHeaders() });
      }, error => {
        const errorMessage = 'Cannot get workspace types';
        const payload = errorMessage ?? { status: false, message: error };
        this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
      });
    }

    public getOne(req, res) {
      const name = req.param('name');
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      return WorkspaceTypesService.getOne(brand, name)
        .subscribe(response => {
          let workspaceType = null;
          if (response) {
            workspaceType = response;
          }
          this.sendResp(req, res, { data: { status: true, workspaceType: workspaceType }, headers: this.getNoCacheHeaders() });
        }, error => {
          const errorMessage = 'Cannot get workspace types';
          const payload = errorMessage ?? { status: false, message: error };
          this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
        });
    }

    //May be irrelevant because the logo upload should be done at bootstrap.
    public uploadLogo(req, res) {
      const that = this;
      req.file('logo').upload({
        adapter: this.blobAdapter
      }, function (err, filesUploaded) {
        if (err) {
          const payload = err ?? { status: false, message: err };
          return that.sendResp(req, res, { data: payload, headers: that.getNoCacheHeaders() });
        }
        return that.sendResp(req, res, { data: { status: true }, headers: that.getNoCacheHeaders() });
      });
    }

    public renderImage(req, res) {
      const type = req.param('workspaceType');
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      return WorkspaceTypesService.getOne(brand, type).subscribe(response => {
        this.blobAdapter.read(response.logo, function (error, file) {
          if (error) {
            sails.log.warn("There was an error rending image for workspace controller. Sending back image from default image location...");
            res.sendFile(sails.config.appPath + `assets/images/${sails.config.static_assets.logoName}`);
          } else {
            res.contentType(`image/${sails.config.static_assets.imageType}`);
            res.send(Buffer.from(file));
          }
        });
      });
    }
  }
}
