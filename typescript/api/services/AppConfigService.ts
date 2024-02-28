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
import { ConfigModels } from '../configmodels/ConfigModels'; // Import the ConfigModels module
import { AppConfig as AppConfigInterface } from '../configmodels/AppConfig.interface';
import * as TJS from "typescript-json-schema";
import { globSync } from 'glob';

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
    modelSchemaMap:any = {};

    protected _exportedMethods: any = [
      'bootstrap',
      'getAllConfigurationForBrand',
      'loadAppConfigurationModel',
      'getAppConfigurationForBrand',
      'createOrUpdateConfig',
      'getAppConfigForm'
    ];


    public bootstrap = (): Observable<any> => {
      this.brandingAppConfigMap = {}
      return Observable.fromPromise(this.bootstrapAsync());
    }

    private async bootstrapAsync() {
      // Caching the form schemas is for performance 
      // and we shouldn't wait for them to lift the app
      this.initAllConfigFormSchemas().then(result => {
        sails.log.info("Config Form Schemas Loaded");
      })
      let availableBrandings = BrandingService.getAvailable();
      for (let availableBranding of availableBrandings) {
        let branding = BrandingService.getBrand(availableBranding);
        let appConfigObject = await this.loadAppConfigurationModel(branding.id);
        this.brandingAppConfigMap[availableBranding] = appConfigObject;
      }

    }

    async initAllConfigFormSchemas(): Promise<any>{
      let configKeys:string[] = ConfigModels.getConfigKeys();
      for(let configKey of configKeys) {
        let modelDefinition:any = ConfigModels.getModelInfo(configKey);
        this.modelSchemaMap[modelDefinition.modelName] = this.getJsonSchema(modelDefinition);
      }
    }

    private async refreshBrandingAppConfigMap(branding) {
      let appConfig = await this.loadAppConfigurationModel(branding.id)
      this.brandingAppConfigMap[branding.name] = appConfig;
    }

    public getAppConfigurationForBrand(brandName): any {
      return _.get(this.brandingAppConfigMap, brandName, sails.config.brandingConfigurationDefaults == undefined? {} : sails.config.brandingConfigurationDefaults);
    }

    public getAllConfigurationForBrand = (brandId): Promise<any> => {
      return AppConfig.find({ branding: brandId });
    }

    public async loadAppConfigurationModel(brandId): Promise<any> {
      let appConfiguration = {};
      const modelNames = ConfigModels.getConfigKeys();
      for(let modelName of modelNames) {
        const modelClass = ConfigModels.getModelInfo(modelName).class;
        let defaultModel = new modelClass();
         _.set(appConfiguration, modelName, defaultModel);
      }
      
      // grab any default branding configuration we're overriding in config
      _.merge(appConfiguration,sails.config.brandingConfigurationDefaults);
      
      
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

    public async createOrUpdateConfig(branding, configKey, configData): Promise<any> {

      let dbConfig = await AppConfig.findOne({ branding: branding.id, configKey });
      
      // Create if no config exists
      if (dbConfig == null) {
        let createdRecord = await AppConfig.create({ branding: branding.id, configKey: configKey, configData: configData });
        
        this.refreshBrandingAppConfigMap(branding);
        return createdRecord.configData;
      }

      let updatedRecord = await AppConfig.updateOne({ branding: branding.id, configKey }).set({ configData: configData });
      this.refreshBrandingAppConfigMap(branding);
      return updatedRecord.configData;
    }

    public async createConfig(brandName, configKey, configData): Promise<any> {
      let branding = BrandingService.getBrand(brandName);
      let dbConfig = await AppConfig.findOne({ branding: branding.id, configKey });
      
      // Create if no config exists
      if (dbConfig == null) {
        let createdRecord = await AppConfig.create({ branding: branding.id, configKey: configKey, configData: configData });
        
        this.refreshBrandingAppConfigMap(branding);
        return createdRecord.configData;
      }

      throw Error(`Config with key ${configKey} for branding ${brandName} already exists`)
    }

    public async getAppConfigForm(branding, configForm): Promise<any> {
      
      let appConfig = await this.getAppConfigurationForBrand(branding.name);
      
      let modelDefinition:any = ConfigModels.getModelInfo(configForm);
      let model = _.get(appConfig, configForm, new modelDefinition.class());
      const jsonSchema: any = this.getJsonSchema(modelDefinition);
      
      let configData = {model: model, schema: jsonSchema, fieldOrder:modelDefinition.class.getFieldOrder()};
      return configData;
    }

    private getJsonSchema(modelDefinition: any): any {
      if(this.modelSchemaMap[modelDefinition.modelName] != undefined) {
        return this.modelSchemaMap[modelDefinition.modelName];
      }
      const wildcardPath =  `${sails.config.appPath}/typescript/api/configmodels/*.ts`;
      const filePaths = globSync(wildcardPath);
      const typeName = modelDefinition.modelName;

      const program = TJS.getProgramFromFiles(filePaths);
      const settings = {
          titles: true
      };

      // Generate the schema
      const schema = TJS.generateSchema(program, typeName, settings);
      return schema;
    }
  }

}

module.exports = new Services.AppConfigs().exports();
