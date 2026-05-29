import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';
import { ReportConfigDto, ReportConfigPreviewDto } from '@researchdatabox/sails-ng-common';
import { merge as _merge } from 'lodash-es';
import { firstValueFrom } from 'rxjs';

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
    return firstValueFrom(this.http.get(`${this.brandingAndPortalUrl}/admin/report-config`, this.reqOptsJsonBodyOnly)) as unknown as Promise<ReportConfigDto[]>;
  }

  public create(report: ReportConfigDto): Promise<ReportConfigDto> {
    return firstValueFrom(this.http.post(`${this.brandingAndPortalUrl}/admin/report-config`, report, this.reqOptsJsonBodyOnly)) as unknown as Promise<ReportConfigDto>;
  }

  public update(report: ReportConfigDto): Promise<ReportConfigDto> {
    return firstValueFrom(this.http.put(`${this.brandingAndPortalUrl}/admin/report-config/${encodeURIComponent(report.name)}`, report, this.reqOptsJsonBodyOnly)) as unknown as Promise<ReportConfigDto>;
  }

  public delete(name: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(this.http.delete(`${this.brandingAndPortalUrl}/admin/report-config/${encodeURIComponent(name)}`, this.reqOptsJsonBodyOnly)) as unknown as Promise<{ deleted: boolean }>;
  }

  public preview(report: ReportConfigDto): Promise<ReportConfigPreviewDto> {
    return firstValueFrom(this.http.post(`${this.brandingAndPortalUrl}/admin/report-config/preview`, report, this.reqOptsJsonBodyOnly)) as unknown as Promise<ReportConfigPreviewDto>;
  }

  public async listNamedQueries(): Promise<{ name: string }[]> {
    const response = await firstValueFrom(this.http.get(`${this.brandingAndPortalUrl}/api/named-query`, this.reqOptsJsonBodyOnly));
    const wrapped = response as { data?: { name: string }[] };
    const queries = (wrapped && typeof wrapped === 'object' && Array.isArray(wrapped.data)) ? wrapped.data : (response as unknown as { name: string }[]);
    return Array.isArray(queries) ? queries : [];
  }
}
