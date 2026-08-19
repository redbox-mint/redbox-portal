import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import {
  GenerationCommitRequest,
  GenerationCommitResult,
  GenerationExecuteRequest,
  GenerationFieldProvenanceView,
  GenerationLaunchRequest,
  GenerationLaunchResult,
  GenerationProvenanceResponse,
  GenerationRunView,
} from '@researchdatabox/sails-ng-common';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';
import { firstValueFrom, Observable } from 'rxjs';

type WrappedResponse<T> = { data: T };

@Injectable({ providedIn: 'root' })
export class GenerationApiService extends HttpClientService {
  constructor(
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
  ) {
    super(http, rootContext, utilService, configService);
  }

  public override async waitForInit(): Promise<this> {
    await super.waitForInit();
    this.enableCsrfHeader();
    return this;
  }

  public async launch(request: GenerationLaunchRequest): Promise<GenerationLaunchResult> {
    return this.request(this.http.post<WrappedResponse<GenerationLaunchResult>>(
      `${await this.generationBaseUrl()}/generation/launch`,
      request,
      this.options(),
    ));
  }

  public async getRun(runId: string): Promise<GenerationRunView> {
    return this.request(this.http.get<WrappedResponse<GenerationRunView>>(
      `${await this.generationBaseUrl()}/generation/runs/${encodeURIComponent(runId)}`,
      this.options(),
    ));
  }

  public async execute(runId: string, request: GenerationExecuteRequest): Promise<GenerationRunView> {
    return this.request(this.http.post<WrappedResponse<GenerationRunView>>(
      `${await this.generationBaseUrl()}/generation/runs/${encodeURIComponent(runId)}/execute`,
      request,
      this.options(),
    ));
  }

  public async cancel(runId: string): Promise<GenerationRunView> {
    return this.request(this.http.post<WrappedResponse<GenerationRunView>>(
      `${await this.generationBaseUrl()}/generation/runs/${encodeURIComponent(runId)}/cancel`,
      {},
      this.options(),
    ));
  }

  public async commit(runId: string, request: GenerationCommitRequest): Promise<GenerationCommitResult> {
    return this.request(this.http.post<WrappedResponse<GenerationCommitResult>>(
      `${await this.generationBaseUrl()}/generation/runs/${encodeURIComponent(runId)}/commit`,
      request,
      this.options(),
    ));
  }

  public async provenance(oid: string): Promise<GenerationProvenanceResponse> {
    return this.request(this.http.get<WrappedResponse<GenerationProvenanceResponse>>(
      `${await this.generationBaseUrl()}/record/${encodeURIComponent(oid)}/generation-provenance`,
      this.options(),
    ));
  }

  public async review(provenanceId: string): Promise<GenerationFieldProvenanceView> {
    return this.request(this.http.post<WrappedResponse<GenerationFieldProvenanceView>>(
      `${await this.generationBaseUrl()}/generation/provenance/${encodeURIComponent(provenanceId)}/review`,
      {},
      this.options(),
    ));
  }

  private async generationBaseUrl(): Promise<string> {
    await this.waitForInit();
    return this.brandingAndPortalUrl;
  }

  private options(): Record<string, unknown> {
    return {
      ...this.reqOptsJsonBodyOnly,
      headers: { 'X-ReDBox-Api-Version': '2.0' },
      context: this.httpContext,
    };
  }

  private async request<T>(request: Observable<WrappedResponse<T>>): Promise<T> {
    try {
      const response = await firstValueFrom(request);
      return response.data;
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const body = error.error as { errors?: Array<{ detail?: string; title?: string }>; error?: { messageKey?: string } } | undefined;
        const messageKey = body?.errors?.[0]?.detail ?? body?.errors?.[0]?.title ?? body?.error?.messageKey;
        if (messageKey) throw new Error(messageKey);
      }
      throw error;
    }
  }
}
