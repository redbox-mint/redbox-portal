// This file is generated from internal/sails-ts/api/services/AppConfigService.ts. Do not edit directly.
import { BrandingModel, Services as services } from '../../index';
import { Sails } from "sails";
import * as TJS from "typescript-json-schema";
import { globSync } from 'glob';
import { config } from 'node:process';

type ConfigModels = any;
type Brandings = any;

export interface AppConfigService {
  bootstrap(...args: any[]): any;
  getAllConfigurationForBrand(...args: any[]): any;
  loadAppConfigurationModel(brandId: string): Promise<any>;
  getAppConfigurationForBrand(brandName: string): any;
  createOrUpdateConfig(branding: BrandingModel, configKey: string, configData: string): Promise<any>;
  getAppConfigForm(branding: BrandingModel, configForm: string): Promise<any>;
  getAppConfigByBrandAndKey(brandId: string, configKey: string): Promise<any>;
  createConfig(brandName: string, configKey: string, configData: string): Promise<any>;
  registerConfigModel(info: { key: string; modelName: string; class: any; schema?: any; tsGlob?: string | string[] }): void;
}
