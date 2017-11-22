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

export module Services {
  /**
   * Branding related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Branding extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'loadAvailableBrands',
      'getDefault',
      'getBrand',
      'getAvailable',
      'getBrandAndPortalPath',
      'getBrandFromReq',
      'getPortalFromReq'
    ];

    protected availableBrandings: any =  []
    protected brandings: any = []
    protected dBrand = {name: 'default'};

    public bootstrap = (): Observable<any> => {
      return super.getObservable(BrandingConfig.findOne(this.dBrand))
                              .flatMap(defaultBrand => {
                                if (_.isEmpty(defaultBrand)) {
                                  // create default brand
                                  sails.log.verbose("Default brand doesn't exist, creating...");
                                  return super.getObservable(BrandingConfig.create(this.dBrand))
                                }
                                sails.log.verbose("Default brand already exists...");
                                return Observable.of(defaultBrand);
                              })
                              .flatMap(this.loadAvailableBrands);
    }

    public loadAvailableBrands = (defBrand) :Observable<any> => {
      sails.log.verbose("Loading available brands......");
      // Find all the BrandingConfig we have and add them to the availableBrandings array.
      // A policy is configured to reject any branding values not present in this array.
      return super.getObservable(BrandingConfig.find({}).populate('roles'))
      .flatMap(brands => {
        this.brandings = brands;
        this.availableBrandings = _.map(this.brandings, 'name');
        var defBrandEntry = this.getDefault();
        if (defBrandEntry == null) {
          sails.log.error("Failed to load default brand!");
          return Observable.throw(new Error("Failed to load default brand!"));
        }
        return Observable.of(defBrandEntry);
      });
    }

    public getDefault = () :BrandingConfig => {
      return _.find(this.brandings, (o) => {return o.name == this.dBrand.name});
    }

    public getBrand = (name) :BrandConfig => {
      return _.find(this.brandings, (o) => {return o.name == name});
    }

    public getAvailable = () => {
      return this.availableBrandings;
    }

    public getBrandAndPortalPath(req) {
      const branding = this.getBrandFromReq(req);
      const portal = this.getPortalFromReq(req);
      const path = `/${branding}/${portal}`;
      return path;
    }

    public getBrandFromReq(req) {
      return req.params['branding'] || req.body.branding || req.session.branding || sails.config.auth.defaultBrand;
    }

    public getPortalFromReq(req) {
      return req.params['portal'] || req.body.portal || req.session.portal || sails.config.auth.defaultPortal;
    }

  }

}

module.exports = new Services.Branding().exports();
