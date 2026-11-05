import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

@Injectable({ providedIn: 'root' })
export class PartyImportApiService extends HttpClientService {
  constructor(@Inject(HttpClient) http: HttpClient, @Inject(APP_BASE_HREF) root: string, @Inject(UtilityService) util: UtilityService, @Inject(ConfigService) config: ConfigService) { super(http, root, util, config); }
  async request(action: string, body: object): Promise<any> {
    await this.waitForInit();
    this.enableCsrfHeader();
    const response: any = await firstValueFrom(this.http.post(`${this.brandingAndPortalUrl}/admin/parties/import/${action}`, body, { ...this.reqOptsJsonBodyOnly, context: this.httpContext }));
    return response?.data ?? response;
  }
}
