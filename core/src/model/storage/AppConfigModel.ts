import { BrandingModel } from "./BrandingModel";

export interface AppConfigModel {
    configKey: string;
    branding: BrandingModel;
    configData?: {
        [key: string]: any;
    }; 
  }