import { BrandingModel } from "./BrandingModel"; 
import type { DashboardTableConfig } from '../../config/workflow.config';
export interface DashboardTypeModel {
    key: string;
    name: string;
    branding: BrandingModel;
    description?: string;
    formatRules: Record<string, unknown>;
    tableConfig: DashboardTableConfig;
    searchable: boolean;
    system: boolean;
  }
