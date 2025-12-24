// This file is generated from internal/sails-ts/api/services/DashboardTypesService.ts. Do not edit directly.
import { Observable, zip, of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services, BrandingModel } from '../../index';
import { TemplateCompileInput } from "@researchdatabox/sails-ng-common";
import { Sails, Model } from "sails";

export interface DashboardRowConfig {
    title: string;
    variable: string;
    template: string;
    initialSort?: 'asc' | 'desc';
    defaultSort?: boolean;
    secondarySort?: string;
  }
export interface DashboardTableConfig {
    rowConfig?: DashboardRowConfig[];
    rowRulesConfig?: any[];
    groupRowConfig?: DashboardRowConfig[];
    groupRowRulesConfig?: any[];
    formatRules?: any;
  }
export interface RecordTypeDashboardConfig {
    /** Whether to show the admin sidebar on the dashboard page */
    showAdminSideBar?: boolean;
  }

export interface DashboardTypesService {
  bootstrap(defBrand: any): Promise<any>;
  create(brand: any, name: any, config: any): any;
  get(brand: any, name: any): any;
  getAll(brand: any): any;
  getDashboardTableConfig(brand: BrandingModel, recordType: string, workflowStage: string): Promise<DashboardTableConfig | null>;
  getRecordTypeDashboardConfig(brand: BrandingModel, recordType: string): Promise<RecordTypeDashboardConfig | null>;
  extractDashboardTemplates(brand: BrandingModel, recordType: string, workflowStage: string, dashboardType?: string): Promise<TemplateCompileInput[]>;
}
