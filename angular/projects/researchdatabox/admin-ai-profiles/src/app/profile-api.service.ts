import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '../../../portal-ng-common/src/lib/config.service';
import { HttpClientService } from '../../../portal-ng-common/src/lib/httpClient.service';
import { UtilityService } from '../../../portal-ng-common/src/lib/utility.service';
import type { ProfileOverview, ProfileSummary, ProfileVersion, ProfileDraft, ProfileDeletion, ProfileTestResult } from '@researchdatabox/sails-ng-common/runtime';

export class ProfileApiError extends Error {
  constructor(public status: number, public messageKey: string) { super(messageKey); }
}

@Injectable()
export class ProfileApiService extends HttpClientService {
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
      return await firstValueFrom(this.http.request<T>(method, `${this.brandingAndPortalUrl}/app/ai-profiles${path}`, {
        context: this.httpContext, body, observe: 'body', responseType: 'json',
      }));
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const key = error instanceof HttpErrorResponse ? error.error?.error?.messageKey : undefined;
      throw new ProfileApiError(status, typeof key === 'string' && /^ai-profiles-error-[a-z-]+$/.test(key)
        ? key : status === 403 ? 'ai-profiles-error-generation-source-forbidden' : 'ai-profiles-error-generation-provider-unavailable');
    }
  }
  overview(): Promise<ProfileOverview> { return this.request('GET', '/overview'); }
  create(body: { name: string; sourceRecordType: string; targetFormName: string }): Promise<ProfileSummary> { return this.request('POST', '/profiles', body); }
  save(id: string, body: ProfileDraft): Promise<ProfileVersion> { return this.request('PUT', '/versions/' + encodeURIComponent(id), body); }
  publish(id: string, expectedContentHash: string): Promise<ProfileVersion> { return this.request('POST', '/versions/' + encodeURIComponent(id) + '/publish', { expectedContentHash }); }
  version(id: string): Promise<ProfileVersion> { return this.request('POST', '/versions/' + encodeURIComponent(id) + '/versions'); }
  retire(id: string): Promise<ProfileVersion> { return this.request('POST', '/versions/' + encodeURIComponent(id) + '/retire'); }
  duplicate(key: string, name: string): Promise<ProfileSummary> { return this.request('POST', '/profiles/' + encodeURIComponent(key) + '/duplicate', { name }); }
  discard(id: string): Promise<ProfileDeletion> { return this.request('DELETE', '/versions/' + encodeURIComponent(id)); }
  remove(key: string): Promise<ProfileDeletion> { return this.request('DELETE', '/profiles/' + encodeURIComponent(key)); }
  tests(id: string): Promise<ProfileTestResult[]> { return this.request('POST', '/versions/' + encodeURIComponent(id) + '/tests'); }
}
