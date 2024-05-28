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

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;

declare var BrandingService;
declare var AppConfigService;
declare var RolesService;
declare var DashboardService;
declare var UsersService;
declare var User;
declare var _;
import { APIActionResponse, APIErrorResponse, BrandingModel } from '@researchdatabox/redbox-core-types';
/**
 * Package that contains all Controllers.
 */
 import {Controllers as controllers} from '@researchdatabox/redbox-core-types';
 


declare var TranslationService;

export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Admin extends controllers.Core.Controller {



    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'refreshCachedResources',
      'setAppConfig',
      'getAppConfig'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public async refreshCachedResources(req, res) {
      try {
        let response = new APIActionResponse();
        TranslationService.reloadResources();
        sails.config.startupMinute = Math.floor(Date.now() / 60000);

        return this.apiRespond(req, res, response, 200)
      } catch (error) {
        this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async setAppConfig(req, res) {
      try {
        let configKey = req.param('configKey')
        
        let brandName:string = BrandingService.getBrandFromReq(req);
        let brand:BrandingModel = BrandingService.getBrand(brandName);
        
        let config = await AppConfigService.createOrUpdateConfig(brand.name, configKey, req.body)
        
        let response = new APIActionResponse('App configuration updated successfully');

        return this.apiRespond(req, res, response, 200)
      } catch (error) {
        this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async getAppConfig(req, res) {
      try {
        let configKey = req.param('configKey')
        
        let brandName:string = BrandingService.getBrandFromReq(req);
        
        let brand:BrandingModel = BrandingService.getBrand(brandName);
        
        let config = AppConfigService.getAppConfigurationForBrand(brand.name)
        if(!_.isEmpty(configKey)) {
          config = _.get(config, configKey, null)
        }

        return this.apiRespond(req, res, config, 200)
      } catch (error) {
        this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }


   

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Admin().exports();