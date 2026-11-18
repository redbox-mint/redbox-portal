import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '../../../portal-ng-common/src/lib/config.service';
import { HttpClientService } from '../../../portal-ng-common/src/lib/httpClient.service';
import { UtilityService } from '../../../portal-ng-common/src/lib/utility.service';
import type {
  GenerationAdminDeletion, GenerationAdminOverview, GenerationAdminConnectionDraft, GenerationAdminConnection,
  GenerationAdminConnectionHealth, GenerationAdminCreateModel, GenerationAdminUpdateDraft,
  GenerationAdminModelVersion, GenerationAdminPublishModel, GenerationAdminTryPrompt, GenerationAdminPromptResult,
} from '@researchdatabox/sails-ng-common/runtime';

export class ModelApiError extends Error {
  constructor(public status: number, public messageKey: string) { super(messageKey); }
}

@Injectable()
export class ModelApiService extends HttpClientService {
  constructor(@Inject(HttpClient) http: HttpClient, @Inject(APP_BASE_HREF) root: string,
    @Inject(UtilityService) util: UtilityService, @Inject(ConfigService) config: ConfigService) {
    super(http, root, util, config);
  }
  override async waitForInit(): Promise<this> {
    await super.waitForInit();
    this.enableCsrfHeader();
    return this;
  }
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.waitForInit();
    try {
      return await firstValueFrom(this.http.request<T>(method, `${this.brandingAndPortalUrl}/app/ai-models${path}`, {
        context: this.httpContext, body, observe: 'body', responseType: 'json',
      }));
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const key = error instanceof HttpErrorResponse ? error.error?.error?.messageKey : undefined;
      throw new ModelApiError(status, typeof key === 'string' && /^ai-models-provider-error-[a-z-]+$/.test(key)
        ? key : status === 403 ? 'ai-models-provider-error-generation-source-forbidden' : 'ai-models-provider-error-generation-provider-unavailable');
    }
  }
  overview(): Promise<GenerationAdminOverview> { return this.request('GET', '/overview'); }
  saveConnection(draft: GenerationAdminConnectionDraft, id?: string): Promise<GenerationAdminConnection> {
    return this.request(id ? 'PUT' : 'POST', `/connections${id ? '/' + encodeURIComponent(id) : ''}`, draft);
  }
  testConnection(connection: GenerationAdminConnectionDraft, connectionId?: string): Promise<GenerationAdminConnectionHealth> {
    return this.request('POST', '/connections/test', { connection, ...(connectionId ? { connectionId } : {}) });
  }
  createModel(draft: GenerationAdminCreateModel): Promise<GenerationAdminModelVersion> { return this.request('POST', '/models', draft); }
  saveModel(id: string, draft: GenerationAdminUpdateDraft): Promise<GenerationAdminModelVersion> {
    return this.request('PUT', `/models/${encodeURIComponent(id)}`, draft);
  }
  version(id: string): Promise<GenerationAdminModelVersion> { return this.request('POST', `/models/${encodeURIComponent(id)}/versions`); }
  publish(id: string, body: GenerationAdminPublishModel): Promise<GenerationAdminModelVersion> { return this.request('POST', `/models/${encodeURIComponent(id)}/publish`, body); }
  retire(id: string): Promise<GenerationAdminModelVersion> { return this.request('POST', `/models/${encodeURIComponent(id)}/retire`); }
  deleteConnection(id: string): Promise<GenerationAdminDeletion> { return this.request('DELETE', `/connections/${encodeURIComponent(id)}`); }
  discardDraft(id: string): Promise<GenerationAdminDeletion> { return this.request('DELETE', `/models/${encodeURIComponent(id)}`); }
  deleteModel(key: string): Promise<GenerationAdminDeletion> { return this.request('DELETE', `/models/by-key/${encodeURIComponent(key)}`); }
  tryPrompt(body: GenerationAdminTryPrompt): Promise<GenerationAdminPromptResult> { return this.request('POST', '/try-prompt', body); }
}
