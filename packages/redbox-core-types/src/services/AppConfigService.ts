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

import { Observable } from 'rxjs';
import { BrandingModel } from '../model/storage/BrandingModel';
import { Services as services } from '../CoreService';
import { ConfigModels } from '../configmodels/ConfigModels';
import { AppConfig as AppConfigInterface } from '../configmodels/AppConfig.interface';
import { Sails } from "sails";
import { find } from 'lodash';
import { Services as Brandings } from './BrandingService'
import * as TJS from "typescript-json-schema";
import { globSync } from 'glob';
import { config } from 'node:process';

declare var AppConfig;

declare var sails: Sails;
declare var _;


export module Services {
  /**
   * AppConfig related functions...
   *
   * 
   */
  export class AppConfigs extends services.Core.Service {
    brandingAppConfigMap!: {};
    modelSchemaMap: any = {};
    private extraTsGlobs: Set<string> = new Set();

    protected override _exportedMethods: any = [
      'bootstrap',
      'getAllConfigurationForBrand',
      'loadAppConfigurationModel',
      'getAppConfigurationForBrand',
      'createOrUpdateConfig',
      'getAppConfigForm',
      'getAppConfigByBrandAndKey',
      'createConfig',
      'registerConfigModel'
    ];


    public bootstrap = (): Promise<void> => {
      this.brandingAppConfigMap = {}
      return this.bootstrapAsync();
    }

    private async bootstrapAsync() {
      // Caching the form schemas is for performance 
      // and we shouldn't wait for them to lift the app
      this.initAllConfigFormSchemas().then(result => {
        sails.log.info("Config Form Schemas Loaded");
      })
      let availableBrandings = BrandingService.getAvailable();
      for (let availableBranding of availableBrandings) {
        let branding: BrandingModel = BrandingService.getBrand(availableBranding);
        let appConfigObject = await this.loadAppConfigurationModel(branding.id);
        this.brandingAppConfigMap[availableBranding] = appConfigObject;
      }

    }

    async initAllConfigFormSchemas(): Promise<any> {
      const configKeys: string[] = ConfigModels.getConfigKeys();
      
      // First pass: collect all TS globs before generating any schemas
      for (const configKey of configKeys) {
        const modelDefinition: any = ConfigModels.getModelInfo(configKey);
        if (modelDefinition?.tsGlob) {
          const globs = Array.isArray(modelDefinition.tsGlob) ? modelDefinition.tsGlob : [modelDefinition.tsGlob];
          globs.filter(Boolean).forEach(g => this.extraTsGlobs.add(g));
        }
      }

      // Second pass: generate schemas (now all globs are available)
      for (const configKey of configKeys) {
        const modelDefinition: any = ConfigModels.getModelInfo(configKey);
        // Init schema and put it in the cache
        this.getJsonSchema(modelDefinition);
      }
    }

    private async refreshBrandingAppConfigMap(branding: BrandingModel) {
      let appConfig = await this.loadAppConfigurationModel(branding.id)
      this.brandingAppConfigMap[branding.name] = appConfig;
    }

    public getAppConfigurationForBrand(brandName: string): any {
      return _.get(this.brandingAppConfigMap, brandName, sails.config.brandingConfigurationDefaults == undefined ? {} : sails.config.brandingConfigurationDefaults);
    }

    public getAllConfigurationForBrand = (brandId: string): Promise<any> => {
      return AppConfig.find({ branding: brandId });
    }

    public async loadAppConfigurationModel(brandId: string): Promise<any> {
      let appConfiguration = {};
      const modelNames = ConfigModels.getConfigKeys();
      for (let modelName of modelNames) {
        const modelClass = ConfigModels.getModelInfo(modelName).class;
        let defaultModel = new modelClass();
        _.set(appConfiguration, modelName, defaultModel);
      }

      // grab any default branding configuration we're overriding in config
      _.merge(appConfiguration, sails.config.brandingConfigurationDefaults);


      let appConfigItems: any[] = await this.getAllConfigurationForBrand(brandId);
      for (let appConfigItem of appConfigItems) {
        _.set(appConfiguration, appConfigItem.configKey, appConfigItem.configData);
      }
      return appConfiguration;
    }

    public async getAppConfigByBrandAndKey(brandId: string, configKey: string): Promise<any> {
      let dbConfig = await AppConfig.findOne({ branding: brandId, configKey });

      // If no config exists in the DB return the default settings
      if (dbConfig != null) {
        return dbConfig.configData;
      }

      let config = _.get(sails.config.brandingConfigurationDefaults, configKey, {});
      if (_.isEmpty(config)) {
        const modelInfo: any = ConfigModels.getModelInfo(configKey);
        if (modelInfo == null) {
          throw Error(`No config found for config key ${configKey}`);
        }
        const modelClass = modelInfo.class;
        config = new modelClass();
      }
      return config;
    }

    public async createOrUpdateConfig(branding: BrandingModel, configKey: string, configData: string): Promise<any> {
      const dbConfig = await AppConfig.findOne({ branding: branding.id, configKey });

      // Create if no config exists
      let record;
      if (dbConfig == null) {
        record = await AppConfig.create({ branding: branding.id, configKey: configKey, configData: configData });
      } else {
        record = await AppConfig.updateOne({ branding: branding.id, configKey }).set({ configData: configData });
      }

      await this.refreshBrandingAppConfigMap(branding);
      return record.configData;
    }

    public async createConfig(brandName: string, configKey: string, configData: string): Promise<any> {
      let branding: BrandingModel = BrandingService.getBrand(brandName);
      let dbConfig = await AppConfig.findOne({ branding: branding.id, configKey });

      // Create if no config exists
      if (dbConfig == null) {
        let createdRecord = await AppConfig.create({ branding: branding.id, configKey: configKey, configData: configData });

        await this.refreshBrandingAppConfigMap(branding);
        return createdRecord.configData;
      }

      throw Error(`Config with key ${configKey} for branding ${brandName} already exists`);
    }

    public async getAppConfigForm(branding: BrandingModel, configForm: string): Promise<any> {

      let appConfig = await this.getAppConfigurationForBrand(branding.name);

      let modelDefinition: any = ConfigModels.getModelInfo(configForm);
      let model = _.get(appConfig, configForm, new modelDefinition.class());
      const jsonSchema: any = this.getJsonSchema(modelDefinition);

      let configData = { model: model, schema: jsonSchema, fieldOrder: modelDefinition.class.getFieldOrder() };
      return configData;
    }

    private getJsonSchema(modelDefinition: any): any {
      // Check if schema is already cached
      if (this.modelSchemaMap[modelDefinition.modelName] != undefined) {
        return this.modelSchemaMap[modelDefinition.modelName];
      }

      if (modelDefinition.schema) {
        sails.log.verbose("A schema was provided for model, using it instead of generating it from the typescript model. Model name:", modelDefinition.modelName);
        this.modelSchemaMap[modelDefinition.modelName] = modelDefinition.schema;
        return modelDefinition.schema;
      }

      sails.log.verbose("No schema was provided for model, generating it from the typescript model. Model name:", modelDefinition.modelName);
      // const wildcardPath = `${sails.config.appPath}/typescript/api/configmodels/*.ts`;
      const extraGlobs = Array.from(this.extraTsGlobs.values());
      const filePaths = Array.from(new Set([
        // ...globSync(wildcardPath),
        ...extraGlobs.flatMap(g => globSync(g))
      ]));
      if (filePaths.length === 0) {
        sails.log.warn(`No source files found for schema generation for model ${modelDefinition.modelName}`);
      }
      const typeName = modelDefinition.modelName;

      const program = TJS.getProgramFromFiles(filePaths);
      const settings: TJS.PartialArgs = {
        // TODO: enabling the 'titles' setting seems to mean that
        //  the generated titles cannot be overridden.
        //  This is a problem when the generated title (field name) is not clear.
        //  Fixed for now by declaring titles for all the model fields and turning this setting off.
        // titles: true,
      };

      // Generate the schema and cache it
      const schema = TJS.generateSchema(program, typeName, settings);
      this.modelSchemaMap[modelDefinition.modelName] = schema;
      return schema;
    }

    /**
     * Public API for hooks/extensions to register additional config models.
     * - If a prebuilt JSON schema is provided, it will be cached and preferred.
     * - If a TS glob is provided, it will be used to find model types for schema generation.
     */
    public registerConfigModel(info: { key: string; modelName: string; class: any; schema?: any; tsGlob?: string | string[] }): void {
      // persist in ConfigModels registry
      ConfigModels.register(info.key, { modelName: info.modelName, class: info.class, schema: info.schema, tsGlob: info.tsGlob });
      // cache schema if provided
      if (info.schema) {
        this.modelSchemaMap[info.modelName] = info.schema;
      }
      // collect any extra TS globs
      if (info.tsGlob) {
        const globs = Array.isArray(info.tsGlob) ? info.tsGlob : [info.tsGlob];
        globs.filter(g => g && typeof g === 'string' && g.trim().length > 0).forEach(g => this.extraTsGlobs.add(g));
      }
      // ensure existing branding app configs get a default instance if not present
      if (this.brandingAppConfigMap) {
        try {
          const defaultInstance = new info.class();
          Object.keys(this.brandingAppConfigMap).forEach(brandName => {
            const brandConfig = this.brandingAppConfigMap[brandName] || {};
            if (_.get(brandConfig, info.key) === undefined) {
              _.set(brandConfig, info.key, defaultInstance);
            }
            this.brandingAppConfigMap[brandName] = brandConfig;
          });
        } catch (e) {
          sails.log.warn(`registerConfigModel: could not instantiate default for ${info.key}: ${e?.message || e}`);
        }
      }
    }
  }

}

declare global {
  let AppConfigService: Services.AppConfigs;
}

