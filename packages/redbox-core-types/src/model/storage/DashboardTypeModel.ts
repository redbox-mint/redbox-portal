import { BrandingModel } from "./BrandingModel"; 
export interface DashboardTypeModel {
    key: string;
    name: string;
    branding: BrandingModel;
    formatRules: Record<string, unknown>;
    searchable: boolean;
  }