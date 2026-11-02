import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';
import { ExportJobDto, ExportJobRequest } from '@researchdatabox/sails-ng-common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ExportService extends HttpClientService {
  constructor(
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService
  ) {
    super(http, rootContext, utilService, configService);
  }

  public override async waitForInit(): Promise<this> {
    await super.waitForInit();
    this.enableCsrfHeader();
    return this;
  }

  public async list(): Promise<ExportJobDto[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: ExportJobDto[] }>(`${this.brandingAndPortalUrl}/export/jobs`, {
        context: this.httpContext,
        headers: { 'X-ReDBox-Api-Version': '2.0' }
      })
    );
    return response.data;
  }

  public async create(request: ExportJobRequest): Promise<ExportJobDto> {
    const response = await firstValueFrom(
      this.http.post<{ data: ExportJobDto }>(`${this.brandingAndPortalUrl}/export/jobs`, request, {
        context: this.httpContext,
        headers: { 'X-ReDBox-Api-Version': '2.0' }
      })
    );
    return response.data;
  }

  public async get(id: string): Promise<ExportJobDto> {
    const response = await firstValueFrom(
      this.http.get<{ data: ExportJobDto }>(`${this.brandingAndPortalUrl}/export/jobs/${encodeURIComponent(id)}`, {
        context: this.httpContext,
        headers: { 'X-ReDBox-Api-Version': '2.0' }
      })
    );
    return response.data;
  }

  public async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${this.brandingAndPortalUrl}/export/jobs/${encodeURIComponent(id)}`, {
        context: this.httpContext,
        headers: { 'X-ReDBox-Api-Version': '2.0' }
      })
    );
  }

  public downloadUrl(job: ExportJobDto): string | null {
    const expiresAt = job.expiresAt ? Date.parse(job.expiresAt) : NaN;
    if (job.status !== 'ready' || !job.downloadUrl || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null;
    }
    return `${this.brandingAndPortalUrl}/export/jobs/${encodeURIComponent(job.id)}/download`;
  }
}
