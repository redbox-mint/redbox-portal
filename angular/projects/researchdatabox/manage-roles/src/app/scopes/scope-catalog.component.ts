import { Component, Input, OnInit } from '@angular/core';
import {
  AuthorizationRole,
  AuthorizationRoleSummary,
  AuthorizationScope,
  AuthorizationUiErrorState,
  ScopeRisk,
  ScopeSourceType,
  ScopeStatus,
} from '../authorization-admin.models';
import { AuthorizationAdminError, AuthorizationAdminService } from '../authorization-admin.service';

const ROLE_USAGE_LIMIT = 100;

@Component({
  selector: 'authorization-scope-catalog',
  templateUrl: './scope-catalog.component.html',
  styleUrls: ['./scope-catalog.component.scss'],
  standalone: false,
})
export class ScopeCatalogComponent implements OnInit {
  @Input() public scopeKeys: string[] = [];

  public scopes: AuthorizationScope[] = [];
  public generation = '';
  public nextCursor?: string;
  public loading = false;
  public error?: AuthorizationUiErrorState;
  public usageError?: AuthorizationUiErrorState;
  public liveMessage = '';
  public roleUsage = new Map<string, string[]>();
  public roleUsageTruncated = false;

  public search = '';
  public namespace = '';
  public risk: ScopeRisk | '' = '';
  public sourceType: ScopeSourceType | '' = '';
  public status: ScopeStatus | '' = '';
  private scopeLoadId = 0;

  constructor(private readonly authorizationAdminService: AuthorizationAdminService) {}

  public async ngOnInit(): Promise<void> {
    await Promise.all([this.loadScopes(false), this.loadRoleUsage()]);
  }

  public async loadScopes(append: boolean): Promise<void> {
    const loadId = ++this.scopeLoadId;
    this.loading = true;
    this.liveMessage = 'Loading scope definitions.';
    this.error = undefined;
    try {
      const page = await this.authorizationAdminService.listScopes({
        limit: 50,
        ...(append && this.nextCursor ? { cursor: this.nextCursor } : {}),
        ...(this.search.trim() ? { search: this.search.trim() } : {}),
        ...(this.namespace.trim() ? { namespace: this.namespace.trim() } : {}),
        ...(this.risk ? { risk: this.risk } : {}),
        ...(this.sourceType ? { sourceType: this.sourceType } : {}),
        ...(this.status ? { status: this.status } : {}),
      });
      if (loadId !== this.scopeLoadId) return;
      if (append && this.generation && page.generation !== this.generation) {
        throw new AuthorizationAdminError(
          409,
          'authorization.scope-generation-changed',
          'The deployed scope catalog changed while loading more rows. Reset the filters to load one consistent generation.'
        );
      }
      this.scopes = append ? [...this.scopes, ...page.items] : page.items;
      this.generation = page.generation;
      this.nextCursor = page.nextCursor;
      this.liveMessage = `${this.scopes.length} scope definitions loaded.`;
    } catch (error) {
      if (loadId !== this.scopeLoadId) return;
      this.setError(error);
    } finally {
      if (loadId === this.scopeLoadId) this.loading = false;
    }
  }

  public resetFilters(): void {
    this.search = '';
    this.namespace = '';
    this.risk = '';
    this.sourceType = '';
    this.status = '';
    void this.loadScopes(false);
  }

  public usageLabel(scopeKey: string): string {
    if (!this.scopeKeys.includes('authorization.role.read')) return 'Not available';
    const roles = this.roleUsage.get(scopeKey) ?? [];
    const count = this.roleUsageTruncated ? `At least ${roles.length}` : String(roles.length);
    return roles.length ? `${count}: ${roles.join(', ')}` : `${count} current-brand roles`;
  }

  private async loadRoleUsage(): Promise<void> {
    if (!this.scopeKeys.includes('authorization.role.read')) return;
    this.usageError = undefined;
    try {
      const summaries: AuthorizationRoleSummary[] = [];
      let cursor: string | undefined;
      while (summaries.length < ROLE_USAGE_LIMIT) {
        const page = await this.authorizationAdminService.listRoles({
          limit: Math.min(100, ROLE_USAGE_LIMIT - summaries.length),
          ...(cursor ? { cursor } : {}),
        });
        summaries.push(...page.items);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      this.roleUsageTruncated = Boolean(cursor);
      const roles = await this.loadRoleDetails(summaries);
      const usage = new Map<string, string[]>();
      for (const role of roles) {
        for (const scopeKey of role.effectiveScopeKeys) {
          usage.set(scopeKey, [...(usage.get(scopeKey) ?? []), role.displayName]);
        }
      }
      this.roleUsage = usage;
    } catch (error) {
      this.usageError = this.authorizationAdminService.toUiError(error);
      this.liveMessage = this.usageError.message;
    }
  }

  private async loadRoleDetails(summaries: AuthorizationRoleSummary[]): Promise<AuthorizationRole[]> {
    const roles: AuthorizationRole[] = [];
    const batchSize = 10;
    for (let index = 0; index < summaries.length; index += batchSize) {
      const batch = summaries.slice(index, index + batchSize);
      roles.push(...(await Promise.all(batch.map(role => this.authorizationAdminService.getRole(role.key)))));
    }
    return roles;
  }

  private setError(error: unknown): void {
    this.error = this.authorizationAdminService.toUiError(error);
    this.liveMessage = this.error.message;
  }
}
