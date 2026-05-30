import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';
import { ReportConfigDto, ReportConfigPreviewDto } from '@researchdatabox/sails-ng-common';
import { merge as _merge } from 'lodash-es';
import { firstValueFrom, Observable } from 'rxjs';

type DataEnvelope<T> = { data?: T };

@Injectable()
export class ReportConfigService extends HttpClientService {
  constructor(
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService
  ) {
    super(http, rootContext, utilService, configService);
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    // Attach the CSRF token to the request options so non-GET requests
    // (create/update/delete/preview) pass Sails' CSRF protection.
    this.enableCsrfHeader();
    _merge(this.reqOptsJsonBodyOnly, { context: this.httpContext });
    return this;
  }

  public list(): Promise<ReportConfigDto[]> {
    return this.unwrapResponse<ReportConfigDto[]>(this.http.get(`${this.brandingAndPortalUrl}/admin/report-config`, this.reqOptsJsonBodyOnly));
  }

  public create(report: ReportConfigDto): Promise<ReportConfigDto> {
    return this.unwrapResponse<ReportConfigDto>(this.http.post(`${this.brandingAndPortalUrl}/admin/report-config`, report, this.reqOptsJsonBodyOnly));
  }

  public update(report: ReportConfigDto): Promise<ReportConfigDto> {
    return this.unwrapResponse<ReportConfigDto>(this.http.put(`${this.brandingAndPortalUrl}/admin/report-config/${encodeURIComponent(report.name)}`, report, this.reqOptsJsonBodyOnly));
  }

  public delete(name: string): Promise<{ deleted: boolean }> {
    return this.unwrapResponse<{ deleted: boolean }>(this.http.delete(`${this.brandingAndPortalUrl}/admin/report-config/${encodeURIComponent(name)}`, this.reqOptsJsonBodyOnly));
  }

  public preview(report: ReportConfigDto): Promise<ReportConfigPreviewDto> {
    return this.unwrapResponse<ReportConfigPreviewDto>(this.http.post(`${this.brandingAndPortalUrl}/admin/report-config/preview`, report, this.reqOptsJsonBodyOnly));
  }

  public async listNamedQueries(): Promise<{ name: string }[]> {
    const queries = await this.unwrapResponse<{ name: string }[]>(this.http.get(`${this.brandingAndPortalUrl}/api/named-query`, this.reqOptsJsonBodyOnly));
    return Array.isArray(queries) ? queries : [];
  }

  private async unwrapResponse<T>(request: Observable<unknown>): Promise<T> {
    const response = await firstValueFrom(request);
    const wrapped = response as DataEnvelope<T>;
    return wrapped && typeof wrapped === 'object' && 'data' in wrapped ? wrapped.data as T : response as T;
  }
}
