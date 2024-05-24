import { BrandingModel } from "./BrandingModel"; 
export interface DashboardTypeModel {
    key: string;
    name: string;
    branding: BrandingModel;
    formatRules: any;
    searchable: boolean;
  }