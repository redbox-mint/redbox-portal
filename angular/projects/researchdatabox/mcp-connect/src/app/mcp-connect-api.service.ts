import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';
import { firstValueFrom } from 'rxjs';

export interface PublicOAuthClient {
  clientId?: string;
  callbackUrl?: string;
  callbackPort?: number;
}

export interface McpConnection {
  brand: string;
  endpoint: string;
  issuer: string;
  scope: string;
  metadataUrl: string;
  clients: { codex?: PublicOAuthClient; claudeCode?: PublicOAuthClient; claude?: PublicOAuthClient };
  chatgptPluginUrl?: string;
}

export interface McpSetupStatus {
  state: 'ready' | 'needs-configuration' | 'reporting-disabled' | 'oidc-required' | 'no-reporting-access';
  isAdmin: boolean;
  brand?: string;
  institutionalLoginUrl?: string;
  checks: { configuration: boolean; reporting: boolean; account: boolean; records: boolean };
  recordTypes: string[];
  recordTypeLabels?: Record<string, string>;
  connection?: McpConnection;
  configurationProblems?: string[];
}

@Injectable()
export class McpConnectApiService extends HttpClientService {
  constructor(
    @Inject(HttpClient) http: HttpClient,
    @Inject(APP_BASE_HREF) rootContext: string,
    @Inject(UtilityService) utility: UtilityService,
    @Inject(ConfigService) config: ConfigService
  ) {
    super(http, rootContext, utility, config);
  }

  public async status(): Promise<McpSetupStatus> {
    await this.waitForInit();
    const response = await firstValueFrom(
      this.http.get<McpSetupStatus | { data: McpSetupStatus }>(`${this.brandingAndPortalUrl}/admin/mcp/status`)
    );
    return 'data' in response ? response.data : response;
  }
}
