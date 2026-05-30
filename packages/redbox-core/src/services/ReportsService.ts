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

import { Observable, from, of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, last } from 'rxjs/operators';
import { ListAPIResponse } from '../model/ListAPIResponse';
import { ReportConfig, ReportFilterType, ReportSource, ReportResult } from '../model/config/ReportConfig';
import type { ReportDefinition } from '../config/report.config';
import { NamedQueryConfig } from '../services/NamedQueryService';
import { ReportModel } from '../model/storage/ReportModel';
import type { ReportWaterlineModel } from '../waterline-models/RBReport';
import { SearchService } from '../SearchService';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { ReportDto, TemplateCompileInput, registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';
import { stringify } from 'csv-stringify/sync';
import Handlebars from "handlebars";


type ReportColumnLike = {
  label: string;
  property: string;
  exportTemplate?: string;
  template?: string;
  multivalue?: boolean;
};

type ReportFilterLike = ReportConfig['filter'][number] & {
  [key: string]: unknown;
};

type TemplateConfig = {
  template: string;
  json?: boolean;
};

type SolrSearchResponse = {
  response: {
    numFound: number;
    start: number;
    docs: Array<Record<string, unknown>>;
  };
};

type ReportConfigFilterDto = {
  type: string;
  paramName: string;
  message: string;
  property: string;
  database?: { fromProperty: string; toProperty: string } | null;
};

type ReportConfigColumnDto = {
  label: string;
  property: string;
  hide?: boolean;
  exportTemplate?: string;
  template?: string;
  multivalue?: boolean;
};

export type ReportConfigDto = {
  name: string;
  title: string;
  reportSource: 'database' | 'solr';
  databaseQuery: { queryName: string } | null;
  solrQuery: { baseQuery: string; searchCore: string } | null;
  filter: ReportConfigFilterDto[];
  columns: ReportConfigColumnDto[];
  readOnly: boolean;
  readOnlyReason?: string;
  canEdit: boolean;
  canDelete: boolean;
  canPreview: boolean;
};


export namespace Services {
  /**
   * Reporting related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Reports extends services.Core.Service {

    searchService!: SearchService;
    // Cache for compiled Handlebars templates (keyed by template string)
    private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();
    // Flag to track if helpers are registered
    private helpersRegistered: boolean = false;

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'create',
      'findAllReportsForBrand',
      'get',
      'getResults',
      'getCSVResult',
      'getReportDto',
      'listConfigs',
      'getConfig',
      'createConfig',
      'updateConfig',
      'deleteConfig',
      'previewConfig',
      'extractReportTemplates',
      //exported only for unit testing
      'getDataRows',
      'getCSVHeaderRow'
    ];

    private getReportModel(): ReportWaterlineModel {
      return RBReport;
    }

    public bootstrap = (defBrand: BrandingModel) => {
      let reportModel: ReportWaterlineModel;
      try {
        reportModel = this.getReportModel();
      } catch (_error) {
        sails.log.warn(`${this.logHeader} bootstrap() -> Report model unavailable, skipping report bootstrap.`);
        return of({} as ReportModel);
      }
      return super.getObservable<ReportModel[]>(reportModel.find({
        branding: defBrand.id
      })).pipe(flatMap(reports => {
        if (_.isEmpty(reports)) {
          const rTypes: Observable<ReportModel>[] = [];
          sails.log.verbose("Bootstrapping report definitions... ");
          _.forOwn(sails.config.reports, (config: ReportDefinition, report: string) => {
            const obs = this.create(defBrand, report, config as unknown as ReportConfig);
            obs.subscribe(() => { });
            rTypes.push(obs);
          });
          return from(rTypes);

        } else {

          const rTypes: Observable<ReportModel>[] = [];
          _.each(reports, function (report: ReportModel) {
            rTypes.push(of(report));
          });
          sails.log.verbose("Default reports definition(s) exist.");
          return from(rTypes);
        }
      }), last());
    }

    public findAllReportsForBrand(brand: BrandingModel) {
      const reportModel = this.getReportModel();
      return super.getObservable<ReportModel[]>(reportModel.find({
        branding: brand.id
      }));
    }

    public async get(brand: BrandingModel, name: string) {
      const reportModel = this.getReportModel();
      return await reportModel.findOne({
        key: brand.id + "_" + name
      })
    }

    public create(brand: BrandingModel, name: string, config: ReportConfig): Observable<ReportModel> {
      const reportModel = this.getReportModel();
      return super.getObservable<ReportModel>(reportModel.create({
        name: name,
        branding: brand.id,
        solrQuery: config.solrQuery,
        databaseQuery: config.databaseQuery,
        reportSource: config.reportSource,
        title: config.title,
        filter: config.filter,
        columns: config.columns
      }));
    }

    public async listConfigs(brand: BrandingModel): Promise<ReportConfigDto[]> {
      const reports = await firstValueFrom(this.findAllReportsForBrand(brand));
      return reports.map(report => this.getReportConfigDto(report as unknown as ReportModel));
    }

    public async getConfig(brand: BrandingModel, name: string): Promise<ReportConfigDto | null> {
      const report = await this.get(brand, name);
      return report ? this.getReportConfigDto(report as unknown as ReportModel) : null;
    }

    public async createConfig(brand: BrandingModel, config: ReportConfigDto): Promise<ReportConfigDto> {
      const { dto: normalized } = await this.validateMutableConfig(brand, config, false);
      const existing = await this.get(brand, normalized.name);
      if (existing) {
        throw new ReportConfigServiceError(409, `Report '${normalized.name}' already exists`);
      }
      const created = await firstValueFrom(this.create(brand, normalized.name, normalized as unknown as ReportConfig));
      return this.getReportConfigDto(created as unknown as ReportModel);
    }

    public async updateConfig(brand: BrandingModel, name: string, config: ReportConfigDto): Promise<ReportConfigDto> {
      const existing = await this.get(brand, name);
      if (!existing) {
        throw new ReportConfigServiceError(404, `Report '${name}' not found`);
      }
      if (this.getReportConfigDto(existing as unknown as ReportModel).readOnly) {
        throw new ReportConfigServiceError(403, 'Solr reports cannot be modified');
      }
      const { dto: normalized } = await this.validateMutableConfig(brand, { ...config, name }, true);
      if (config.name && config.name !== name) {
        throw new ReportConfigServiceError(400, 'Report name cannot be changed');
      }
      const reportModel = this.getReportModel();
      const updated = await reportModel.updateOne({ key: `${brand.id}_${name}` }).set({
        title: normalized.title,
        reportSource: normalized.reportSource,
        databaseQuery: normalized.databaseQuery as unknown as Record<string, unknown>,
        solrQuery: normalized.solrQuery as unknown as Record<string, unknown>,
        filter: normalized.filter as unknown as Record<string, unknown>,
        columns: normalized.columns
      });
      if (!updated) {
        throw new ReportConfigServiceError(404, `Report '${name}' not found`);
      }
      return this.getReportConfigDto(updated as unknown as ReportModel);
    }

    public async deleteConfig(brand: BrandingModel, name: string): Promise<{ deleted: boolean }> {
      const existing = await this.get(brand, name);
      if (!existing) {
        throw new ReportConfigServiceError(404, `Report '${name}' not found`);
      }
      if (this.getReportConfigDto(existing as unknown as ReportModel).readOnly) {
        throw new ReportConfigServiceError(403, 'Solr reports cannot be deleted');
      }
      await this.getReportModel().destroyOne({ key: `${brand.id}_${name}` });
      return { deleted: true };
    }

    public async previewConfig(brand: BrandingModel, config: ReportConfigDto, req: Sails.ReqParamProvider): Promise<ReportResult> {
      const { dto: normalized, namedQuery } = await this.validateMutableConfig(brand, config, false);
      const paramMap = this.buildNamedQueryParamMap(req, normalized as unknown as ReportConfig);
      const dbResult = await NamedQueryService.performNamedQueryFromConfig(namedQuery, paramMap, brand, 0, 100);
      const response = this.getTranslateDatabaseResultToReportResult(dbResult as unknown as ListAPIResponse<Record<string, unknown>>, normalized as unknown as ReportConfig);
      response.success = true;
      return response;
    }

    private async validateMutableConfig(brand: BrandingModel, config: ReportConfigDto, isUpdate: boolean): Promise<{ dto: ReportConfigDto; namedQuery: NamedQueryConfig }> {
      const normalized = this.normalizeReportConfigDto(config);
      if (_.isEmpty(normalized.name) || !/^[A-Za-z0-9_-]+$/.test(normalized.name)) {
        throw new ReportConfigServiceError(400, 'Report name is required and must be URL safe');
      }
      if (_.isEmpty(normalized.title)) {
        throw new ReportConfigServiceError(400, 'Report title is required');
      }
      if (normalized.reportSource !== ReportSource.database) {
        throw new ReportConfigServiceError(403, 'Only database reports can be changed');
      }
      if (!normalized.databaseQuery || _.isEmpty(normalized.databaseQuery.queryName)) {
        throw new ReportConfigServiceError(400, 'Named query is required');
      }
      const namedQuery = await NamedQueryService.getNamedQueryConfig(brand, normalized.databaseQuery.queryName);
      if (!namedQuery) {
        throw new ReportConfigServiceError(400, `Named query '${normalized.databaseQuery.queryName}' not found`);
      }
      for (const column of normalized.columns) {
        if (_.isEmpty(column.label) || _.isEmpty(column.property)) {
          throw new ReportConfigServiceError(400, 'Report columns require label and property');
        }
      }
      for (const filter of normalized.filter) {
        if (filter.type === ReportFilterType.dateRange && (!filter.database?.fromProperty || !filter.database?.toProperty)) {
          throw new ReportConfigServiceError(400, 'Database date-range filters require fromProperty and toProperty');
        }
      }
      if (!isUpdate && _.isEmpty(normalized.columns)) {
        normalized.columns = [];
      }
      return { dto: normalized, namedQuery };
    }

    private normalizeReportConfigDto(config: Partial<ReportConfigDto> & { filter?: Array<ReportConfigFilterDto & { messsage?: string }> }): ReportConfigDto {
      const source = config.reportSource ?? ReportSource.database;
      const filter = (config.filter ?? []).map((item: ReportConfigFilterDto) => ({
        paramName: item.paramName ?? '',
        type: item.type ?? ReportFilterType.text,
        property: item.property ?? '',
        message: item.message ?? '',
        database: item.database ?? null
      }));
      const columns: ReportConfigColumnDto[] = (config.columns ?? []).map((column: ReportConfigColumnDto) => ({
        label: column.label ?? '',
        property: column.property ?? '',
        hide: column.hide ?? false,
        exportTemplate: column.exportTemplate ?? '',
        template: column.template ?? '',
        multivalue: column.multivalue ?? false
      }));
      return {
        name: config.name ?? '',
        title: config.title ?? '',
        reportSource: source as 'database' | 'solr',
        databaseQuery: config.databaseQuery ?? null,
        solrQuery: config.solrQuery ?? null,
        filter,
        columns,
        readOnly: source !== ReportSource.database,
        readOnlyReason: source !== ReportSource.database ? 'Solr reports are read-only in this version' : undefined,
        canEdit: source === ReportSource.database,
        canDelete: source === ReportSource.database,
        canPreview: source === ReportSource.database
      };
    }

    private buildSolrParams(brand: BrandingModel, req: Sails.ReqParamProvider, report: ReportConfig, start: number, rows: number, format = 'json') {
      let params = this.getQueryValue(report);
      params = this.addPaginationParams(params, start, rows);
      params = params + `&fq=metaMetadata_brandId:${brand.id}&wt=${format}`;

      if (report.filter != null) {
        let filterQuery = ""
        for (const filter of report.filter) {
          if (filter.type == ReportFilterType.dateRange) {
            const paramName = filter.paramName;
            const fromDate = req.param(paramName + "_fromDate");
            const toDate = req.param(paramName + "_toDate");
            const searchProperty = filter.property;
            filterQuery = filterQuery + "&fq=" + searchProperty + ":[";
            filterQuery = filterQuery + (fromDate == null ? "*" : fromDate);
            filterQuery = filterQuery + " TO ";
            filterQuery = filterQuery + (toDate == null ? "NOW" : toDate) + "]";
          }
          if (filter.type == ReportFilterType.text) {
            const paramName = filter.paramName;
            const value = req.param(paramName)
            if (!_.isEmpty(value)) {
              const searchProperty = filter.property;
              filterQuery = filterQuery + "&fq=" + searchProperty + ":"
              filterQuery = filterQuery + value + "*"
            }
          }
        }
        params = params + filterQuery;
      }

      return params;
    }

    public async getResults(brand: BrandingModel, name = '', req: Sails.ReqParamProvider, start = 0, rows = 10) {
      const reportModel = this.getReportModel();
      const reportObs = super.getObservable<ReportModel | null>(reportModel.findOne({
        key: brand.id + "_" + name
      }));

      let reportObject = await firstValueFrom(reportObs)


      reportObject = this.convertLegacyReport(reportObject as ReportModel);
      const report: ReportConfig = reportObject as ReportConfig;
      if (report.reportSource == ReportSource.database) {
        if (!report.databaseQuery) {
          throw new Error(`Report '${name}' is missing databaseQuery config`);
        }
        const namedQueryConfig = await NamedQueryService.getNamedQueryConfig(brand, report.databaseQuery.queryName)
        if (!namedQueryConfig) {
          throw new Error(`Named query '${report.databaseQuery.queryName}' not found`);
        }
        const paramMap = this.buildNamedQueryParamMap(req, report)
        const dbResult = await NamedQueryService.performNamedQueryFromConfig(namedQueryConfig, paramMap, brand, start, rows);
        return this.getTranslateDatabaseResultToReportResult(dbResult as unknown as ListAPIResponse<Record<string, unknown>>, report);
      } else {
        if (!report.solrQuery) {
          throw new Error(`Report '${name}' is missing solrQuery config`);
        }
        const url = this.buildSolrParams(brand, req, report, start, rows, 'json');
        const solrResults = await this.getSearchService().searchAdvanced(report.solrQuery.searchCore, '', url);
        return this.getTranslateSolrResultToReportResult(solrResults as SolrSearchResponse, rows);
      }
    }

    getTranslateDatabaseResultToReportResult(dbResult: ListAPIResponse<Record<string, unknown>>, _report: ReportConfig) {
      const totalItems = dbResult.summary.numFound;
      const startIndex = dbResult.summary.start;
      const pageNumber = dbResult.summary.page;
      const docs = dbResult.records;

      const response: ReportResult = new ReportResult();
      response.total = totalItems;
      response.pageNum = pageNumber;
      response.recordsPerPage = docs.length;

      const items: Array<Record<string, unknown>> = [];

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        // TODO: filter out the results so we dont have to present all the metadata in the front end
        // Not a huge issue now as only highly privileged users can use reports
        items.push(doc)
      }

      response.records = items;
      return response;
    }

    buildNamedQueryParamMap(req: Sails.ReqParamProvider, report: ReportConfig) {
      const paramMap: Record<string, unknown> = {}
      if (report.filter != null) {
        for (const filter of report.filter) {
          if (filter.type == ReportFilterType.dateRange) {
            const paramName = filter.paramName;
            const fromDate = req.param(paramName + "_fromDate");
            const toDate = req.param(paramName + "_toDate");
            if (filter.database) {
              paramMap[filter.database.fromProperty] = fromDate
              paramMap[filter.database.toProperty] = toDate
            }
          }
          if (filter.type == ReportFilterType.text) {
            const paramName = filter.paramName;
            const value = req.param(paramName)
            paramMap[paramName] = value;
          }
        }
      }

      return paramMap
    }


    getTranslateSolrResultToReportResult(results: SolrSearchResponse, noItems: number) {
      const totalItems = results.response.numFound;
      const startIndex = results.response.start;
      const pageNumber = (startIndex / noItems) + 1;

      const response: ReportResult = new ReportResult();
      response.total = totalItems;
      response.pageNum = pageNumber;
      response.recordsPerPage = _.toNumber(noItems);

      const items: Array<Record<string, unknown>> = [];
      const docs = results.response.docs;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const item: Record<string, unknown> = {};
        for (const key in doc) {
          item[key] = doc[key];
        }
        items.push(item);
      }

      response.records = items;
      return response;
    }

    private getSearchService(): SearchService {
      return sails.services[sails.config.search.serviceName] as unknown as SearchService;
    }

    private convertLegacyReport(report: ReportModel): ReportModel {
      const legacyReport = report as ReportModel & { filter?: unknown };
      if (!_.isArray(legacyReport.filter)) {
        const filterArray: ReportConfig['filter'] = []
        if (legacyReport.filter != null && typeof legacyReport.filter === 'object') {
          const filter = legacyReport.filter as ReportFilterLike;
          filter.paramName = "dateRange";
          filterArray.push(filter);
        }
        legacyReport.filter = filterArray;
      }
      return legacyReport;
    }

    public async getCSVResult(brand: BrandingModel, name = '', req: Sails.ReqParamProvider, start = 0, rows = 1000000000) {
      const reportModel = this.getReportModel();
      let report: ReportModel = await firstValueFrom(super.getObservable<ReportModel>(reportModel.findOne({
        key: brand.id + "_" + name
      })));

      report = this.convertLegacyReport(report);

      // TODO: Ensure we get all results in a tidier way
      //       Stream the resultset rather than load it in-memory
      let result: ReportResult = new ReportResult();
      if (report.reportSource == ReportSource.database) {
        if (!report.databaseQuery) {
          throw new Error(`Report '${name}' is missing databaseQuery config`);
        }
        const namedQueryConfig = await NamedQueryService.getNamedQueryConfig(brand, report.databaseQuery.queryName);
        if (!namedQueryConfig) {
          throw new Error(`Named query '${report.databaseQuery.queryName}' not found`);
        }
        const paramMap = this.buildNamedQueryParamMap(req, report);
        const dbResult = await NamedQueryService.performNamedQueryFromConfig(namedQueryConfig, paramMap, brand, start, rows);
        result = this.getTranslateDatabaseResultToReportResult(dbResult as unknown as ListAPIResponse<Record<string, unknown>>, report);
      } else {
        if (!report.solrQuery) {
          throw new Error(`Report '${name}' is missing solrQuery config`);
        }
        const url = this.buildSolrParams(brand, req, report, start, rows, 'json');
        const solrResults = await this.getSearchService().searchAdvanced(report.solrQuery.searchCore, '', url);
        result = this.getTranslateSolrResultToReportResult(solrResults as SolrSearchResponse, rows);
      }

      const headerRow: string[] = this.getCSVHeaderRow(report)
      const optTemplateData = this.buildOptTemplateData(req)
      const dataRows: string[][] = this.getDataRows(report, result.records, optTemplateData);
      dataRows.unshift(headerRow);
      const csvString = stringify(dataRows);
      return csvString;

    }

    buildOptTemplateData(req: Sails.ReqParamProvider) {
      const templateData: Record<string, unknown> = {
        'brandingAndPortalUrl': BrandingService.getFullPath(req)
      }
      return templateData;
    }

    //TODO: It's public only because we need it at the moment to unit test it
    public getDataRows(report: ReportConfig, data: Array<Record<string, unknown>>, optTemplateData: Record<string, unknown>): string[][] {
      const dataRows: string[][] = [];

      for (const row of data) {
        dataRows.push(this.getDataRow(row, report.columns, optTemplateData));
      }

      return dataRows;
    }

    getDataRow(row: Record<string, unknown>, columns: ReportColumnLike[], optTemplateData: Record<string, unknown>): string[] {
      const dataRow: string[] = [];
      for (const column of columns) {
        dataRow.push(this.getColValue(row, column, optTemplateData))
      }
      return dataRow;
    }

    getColValue(row: Record<string, unknown>, col: ReportColumnLike, optTemplateData: Record<string, unknown>): string {
      if (col.multivalue) {
        const retVal: string[] = [];
        const values = _.get(row, col.property);
        if (Array.isArray(values)) {
          for (const val of values) {
            retVal.push(this.getEntryValue(row, col, val, optTemplateData) as string);
          }
        }
        return retVal.join('');
      } else {
        return this.getEntryValue(row, col, _.get(row, col.property), optTemplateData) as string;
      }
    }

    getEntryValue(row: Record<string, unknown>, col: ReportColumnLike, val: unknown = undefined, optTemplateData: Record<string, unknown> = {}) {
      let retVal: unknown = '';
      const template = this.getExportTemplate(col);
      if (template != null) {
        const data = _.merge({}, row, {
          recordTableMeta: {
            col: col,
            val: val
          },
          optTemplateData: optTemplateData
        });

        retVal = this.runTemplate(data, { template: template });
      } else {
        retVal = _.get(row, col.property, val);
      }
      return retVal;
    }

    getExportTemplate(col: ReportColumnLike) {
      if (!_.isEmpty(col.exportTemplate)) {
        return col.exportTemplate;
      }
      if (!_.isEmpty(col.template)) {
        return col.template;
      }
      return null;
    }

    /**
     * Ensure shared Handlebars helpers are registered.
     */
    private ensureHelpersRegistered() {
      if (!this.helpersRegistered) {
        registerSharedHandlebarsHelpers(Handlebars);
        this.helpersRegistered = true;
        sails.log.verbose('ReportsService: Registered shared Handlebars helpers');
      }
    }

    /**
     * Get or compile a Handlebars template.
     * Uses a cache to avoid recompiling the same template multiple times.
     */
    private getCompiledTemplate(templateString: string): HandlebarsTemplateDelegate {
      this.ensureHelpersRegistered();

      if (!this.compiledTemplates.has(templateString)) {
        const compiled = Handlebars.compile(templateString);
        this.compiledTemplates.set(templateString, compiled);
      }
      return this.compiledTemplates.get(templateString)!;
    }

    /**
     * Run a Handlebars template with the provided data context.
     * This replaces the old lodash template execution.
     * 
     * @param data The data context for the template
     * @param config Configuration object containing the template string
     * @param additionalImports Additional data to merge into context (deprecated, for backward compat)
     * @param field Optional field data (deprecated, for backward compat)
     */
    runTemplate(data: Record<string, unknown>, config: TemplateConfig, additionalImports: Record<string, unknown> = {}, _field: unknown = undefined) {
      try {
        const template = this.getCompiledTemplate(config.template);
        // Build context compatible with the new Handlebars templates
        // The data is provided as the root context
        const context = _.merge({}, data, additionalImports);
        const templateRes = template(context);

        // added ability to parse the string template result into JSON
        // requirement: template must return a valid JSON string object
        if (config.json == true && !_.isEmpty(templateRes)) {
          return JSON.parse(templateRes);
        }
        return templateRes;
      } catch (error) {
        sails.log.error(`ReportsService: Error running template: ${error}`);
        return '';
      }
    }

    /**
     * Extract templates from report configuration for pre-compilation.
     * Converts report column templates to TemplateCompileInput format for Handlebars pre-compilation.
     * 
     * Key structure: [reportName, 'columns', columnIndex, templateKind]
     * where templateKind is 'render' for UI display or 'export' for CSV export
     * 
     * @param brand The branding model
     * @param reportName The name of the report
     * @returns Array of templates ready for compilation
     */
    public async extractReportTemplates(brand: BrandingModel, reportName: string): Promise<TemplateCompileInput[]> {
      const entries: TemplateCompileInput[] = [];

      const report = await this.get(brand, reportName);
      if (!report) {
        sails.log.warn(`ReportsService: Report '${reportName}' not found for template extraction`);
        return entries;
      }

      const columns = report.columns || [];
      sails.log.verbose(`ReportsService: Extracting templates from ${columns.length} columns for report '${reportName}'`);

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];

        // Extract render template (for UI display)
        if (!_.isEmpty(col.template)) {
          entries.push({
            key: [reportName, 'columns', i.toString(), 'render'],
            kind: 'handlebars',
            value: col.template ?? ''
          });
        }

        // Extract export template (for CSV export) - only if different from render
        if (!_.isEmpty(col.exportTemplate)) {
          entries.push({
            key: [reportName, 'columns', i.toString(), 'export'],
            kind: 'handlebars',
            value: col.exportTemplate ?? ''
          });
        }
      }

      sails.log.verbose(`ReportsService: Extracted ${entries.length} templates for report '${reportName}'`);
      return entries;
    }

    public getCSVHeaderRow(report: ReportConfig): string[] {
      const headerRow: string[] = [];
      for (const column of report.columns) {
        headerRow.push(column.label)
      }
      return headerRow;
    }

    protected getQueryValue(report: ReportConfig) {
      if (!report.solrQuery) {
        throw new Error('Missing solrQuery in report config');
      }
      let query = `${report.solrQuery.baseQuery}&sort=date_object_modified desc&version=2.2&fl=`
      for (let i = 0; i < report.columns.length; i++) {
        const column = report.columns[i];
        query = query + column.property;
        if (i != report.columns.length - 1) {
          query = query + ","
        }
      }
      return query;
    }

    protected addPaginationParams(params: string, start = 0, rows: number) {
      params = params + "&start=" + start + "&rows=" + rows;
      return params;
    }

    public getReportDto(reportModel: ReportModel): ReportDto {
      return this.convertToType<ReportDto>(reportModel as unknown as Record<string, unknown>, new ReportDto() as unknown as Record<string, unknown>, {
        "solr_query": "solrQuery"
      }, true);
    }

    public getReportConfigDto(reportModel: ReportModel): ReportConfigDto {
      const converted = this.convertLegacyReport(reportModel);
      const reportSource = converted.reportSource === ReportSource.database ? ReportSource.database : ReportSource.solr;
      return this.normalizeReportConfigDto({
        name: converted.name,
        title: converted.title,
        reportSource,
        databaseQuery: converted.databaseQuery,
        solrQuery: converted.solrQuery,
        filter: converted.filter as Array<ReportConfigFilterDto & { messsage?: string }>,
        columns: converted.columns
      });
    }

  }

  export class ReportConfigServiceError extends Error {
    public status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
}

declare global {
  let ReportsService: Services.Reports;
}
