import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export interface RecordPermissionUser {
  username: string;
  name: string;
  email: string;
}

export interface RecordPermissionsSummary {
  edit: RecordPermissionUser[];
  view: RecordPermissionUser[];
  editPending: string[];
  viewPending: string[];
  editRoles: string[];
  viewRoles: string[];
}

@Injectable({ providedIn: 'root' })
export class RecordPermissionsService extends HttpClientService {
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

  public async getSummary(oid: string): Promise<RecordPermissionsSummary> {
    const recordOid = oid.trim();
    if (!recordOid) throw new Error('Record oid is required.');
    await this.waitForInit();
    const response = await firstValueFrom(
      this.http.get<unknown>(`${this.brandingAndPortalUrl}/record/${encodeURIComponent(recordOid)}/permissions`, {
        context: this.httpContext,
        headers: { 'X-ReDBox-Api-Version': '2.0' },
      })
    );
    const summary = this.isObject(response) && 'data' in response ? response['data'] : response;
    if (!this.isObject(summary)) throw new Error('Invalid record permissions summary.');
    const users = (key: string): RecordPermissionUser[] => {
      const rows = summary[key];
      if (
        !Array.isArray(rows) ||
        !rows.every(
          row =>
            this.isObject(row) && ['username', 'name', 'email'].every(property => typeof row[property] === 'string')
        )
      ) {
        throw new Error('Invalid record permissions summary.');
      }
      return rows as RecordPermissionUser[];
    };
    const strings = (key: string): string[] => {
      const rows = summary[key];
      if (!Array.isArray(rows) || !rows.every(row => typeof row === 'string')) {
        throw new Error('Invalid record permissions summary.');
      }
      return rows;
    };
    return {
      edit: users('edit'),
      view: users('view'),
      editPending: strings('editPending'),
      viewPending: strings('viewPending'),
      editRoles: strings('editRoles'),
      viewRoles: strings('viewRoles'),
    };
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
