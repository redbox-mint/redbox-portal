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
import { Services as services } from '@researchdatabox/redbox-core-types';
import { Sails } from "sails";
import { find } from 'lodash';
declare var AppConfig;

declare var sails: Sails;
declare var BrandingService;
declare var _;


export module Services {
  /**
   * AppConfig related functions...
   *
   * 
   */
  export class AppConfigs extends services.Core.Service {
    brandingAppConfigMap: {};

    protected _exportedMethods: any = [
      'bootstrap',
      'getAllConfigurationForBrand',
      'loadAppConfigurationModel',
      'getAppConfigurationForBrand',
      'createOrUpdateConfig'
    ];


    public bootstrap = (): Observable<any> => {
      this.brandingAppConfigMap = {}
      return Observable.fromPromise(this.boostrapAsync());
    }


    private async boostrapAsync() {
      let availableBrandings = BrandingService.getAvailable();
      for (let availableBranding of availableBrandings) {
        let branding = BrandingService.getBrand(availableBranding);
        let appConfigObject = await this.loadAppConfigurationModel(branding.id);
        this.brandingAppConfigMap[availableBranding] = appConfigObject;
      }
    }

    public getAppConfigurationForBrand(brandName): any {
      return _.get(this.brandingAppConfigMap, brandName, sails.config.brandingConfigurationDefaults);
    }

    public getAllConfigurationForBrand = (brandId): Promise<any> => {
      return AppConfig.find({ branding: brandId });
    }

    public async loadAppConfigurationModel(brandId): Promise<any> {
      let appConfiguration = sails.config.brandingConfigurationDefaults;
      if (appConfiguration == undefined) {
        appConfiguration = {};
      }
      let appConfigItems: any[] = await this.getAllConfigurationForBrand(brandId);
      for (let appConfigItem of appConfigItems) {
        _.set(appConfiguration, appConfigItem.configKey, appConfigItem.configData);
      }
      return appConfiguration;
    }

    public async getAppConfigByBrandAndKey(brandId, configKey): Promise<any> {
      let dbConfig = await AppConfig.findOne({ branding: brandId, configKey });
      // If no config exists in the DB return the default settings
      if (dbConfig == null) {
        return _.get(sails.config.brandingConfigurationDefaults, configKey, {})
      }
      return dbConfig.configData;
    }

    public async createOrUpdateConfig(brandId, configKey, configData): Promise<any> {
      let dbConfig = await AppConfig.findOne({ branding: brandId, configKey });
      // Create if no config exists
      if (dbConfig == null) {
        let createdRecord = await AppConfig.create({ branding: brandId, configKey: configKey, configData: configData });
        return createdRecord.configData;
      }

      let updatedRecord = await AppConfig.updateOne({ branding: brandId, configKey }).set({ configData: configData });
      return updatedRecord.configData;
    }


  }

}

module.exports = new Services.AppConfigs().exports();
