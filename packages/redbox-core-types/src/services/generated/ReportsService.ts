// This file is generated from internal/sails-ts/api/services/ReportsService.ts. Do not edit directly.
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, last } from 'rxjs/operators';
import { ListAPIResponse, ReportConfig, ReportModel, ReportFilterType, ReportSource, ReportResult, SearchService, Services as services, BrandingModel } from '../../index';
import { DateTime } from 'luxon';
import {
  Sails,
  Model
} from "sails";
import { ReportDto, TemplateCompileInput, registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';
import { stringify } from 'csv-stringify/sync';
import Handlebars from "handlebars";

type NamedQueryResponseRecord = any;

export interface ReportsService {
  bootstrap(...args: any[]): any;
  create(brand: any, name: any, config: ReportConfig): Observable<ReportModel>;
  findAllReportsForBrand(brand: any): any;
  get(brand: any, name: any): any;
  getResults(brand: any, name: any | undefined, req: any, start?: any, rows?: any): any;
  getCSVResult(brand: any, name: any | undefined, req: any, start?: any, rows?: any): any;
  getReportDto(reportModel: Model): ReportDto;
  extractReportTemplates(brand: BrandingModel, reportName: string): Promise<TemplateCompileInput[]>;
  getDataRows(report: any, data: any[], optTemplateData: any): string[][];
  getCSVHeaderRow(report: any): string[];
}
