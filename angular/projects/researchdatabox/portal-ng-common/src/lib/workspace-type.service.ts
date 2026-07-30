import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { WorkspaceTypeDefinition } from '@researchdatabox/sails-ng-common';
import { ConfigService } from './config.service';
import { HttpClientService } from './httpClient.service';
import { UtilityService } from './utility.service';

export interface WorkspaceTypesResponse {
  status: boolean;
  workspaceTypes: WorkspaceTypeDefinition[];
}

@Injectable({ providedIn: 'root' })
export class WorkspaceTypeService extends HttpClientService {
  constructor(
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) rootContext: string,
    @Inject(UtilityService) utilService: UtilityService,
    @Inject(ConfigService) configService: ConfigService
  ) {
    super(http, rootContext, utilService, configService);
  }

  async getWorkspaceTypes(): Promise<WorkspaceTypesResponse> {
    await this.waitForInit();
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.brandingAndPortalUrl}/workspaces/types`, this.reqOptsJsonBodyOnly)
    );
    const data = this.unwrapData(response) as Record<string, unknown>;
    const workspaceTypes = Array.isArray(data?.['workspaceTypes'])
      ? data['workspaceTypes'].filter(this.isWorkspaceType).map(item => ({ ...item }))
      : [];
    return { status: data?.['status'] === true, workspaceTypes };
  }

  async getWorkspaceType(name: string): Promise<WorkspaceTypeDefinition> {
    await this.waitForInit();
    const response = await firstValueFrom(
      this.http.get<unknown>(
        `${this.brandingAndPortalUrl}/workspaces/types/${encodeURIComponent(name)}`,
        this.reqOptsJsonBodyOnly
      )
    );
    const data = this.unwrapData(response) as Record<string, unknown>;
    const candidate = (data?.['workspaceType'] ?? data) as unknown;
    if (!this.isWorkspaceType(candidate)) {
      throw new Error(`Workspace type '${name}' was not returned by the server.`);
    }
    return { ...candidate };
  }

  private unwrapData(value: unknown): unknown {
    if (value && typeof value === 'object' && 'data' in value) {
      return (value as Record<string, unknown>)['data'];
    }
    return value;
  }

  private readonly isWorkspaceType = (value: unknown): value is WorkspaceTypeDefinition =>
    !!value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>)['name'] === 'string' &&
    String((value as Record<string, unknown>)['name']).trim().length > 0;
}
