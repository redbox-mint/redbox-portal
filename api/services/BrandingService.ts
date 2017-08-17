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

import { Observable } from 'rxjs/Rx';
import services = require('../../typescript/services/CoreService.js');
import {Sails, Model} from "sails";

declare var sails: Sails;
declare var BrandingConfig: Model;
declare var _this;

export module Services {
  /**
   * Branding related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   */
  export class Branding extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'loadAvailableBrands',
      'getDefault',
      'getBrand',
      'getAvailable',
      'getBrandAndPortalPath'
    ];

    protected availableBrandings: any =  []
    protected brandings: any = []
    protected dBrand = {name: 'default'};

    public bootstrap = (): Observable<any> => {
      return super.getObservable(BrandingConfig.findOne(_this.dBrand))
                              .flatMap(defaultBrand => {
                                if (_.isEmpty(defaultBrand)) {
                                  // create default brand
                                  sails.log.verbose("Default brand doesn't exist, creating...");
                                  return super.getObservable(BrandingConfig.create(_this.dBrand))
                                }
                                sails.log.verbose("Default brand already exists...");
                                return Observable.of(defaultBrand);
                              })
                              .flatMap(_this.loadAvailableBrands);
    }

    public loadAvailableBrands = (defBrand) :Observable<any> => {
      sails.log.verbose("Loading available brands......");
      // Find all the BrandingConfig we have and add them to the availableBrandings array.
      // A policy is configured to reject any branding values not present in this array.
      return super.getObservable(BrandingConfig.find({}).populate('roles'))
      .flatMap(brands => {
        _this.brandings = brands;
        _this.availableBrandings = _.map(_this.brandings, 'name');
        var defBrandEntry = _this.getDefault();
        if (defBrandEntry == null) {
          sails.log.error("Failed to load default brand!");
          return Observable.throw(new Error("Failed to load default brand!"));
        }
        return Observable.of(defBrandEntry);
      });
    }

    public getDefault = () :BrandingConfig => {
      return _.find(_this.brandings, (o) => {return o.name == _this.dBrand.name});
    }

    public getBrand = (name) :BrandConfig => {
      return _.find(_this.brandings, (o) => {return o.name == name});
    }

    public getAvailable = () => {
      return _this.availableBrandings;
    }

    public getBrandAndPortalPath(req) {
      const branding = req.params['branding'] ? req.params['branding'] : sails.config.auth.defaultBrand;
      const portal = req.params['portal'] ? req.params['portal'] : sails.config.auth.defaultPortal;
      const path = `/${branding}/${portal}`;
      return path;
    }

  }

}

module.exports = new Services.Branding().exports();
