import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import {
  AuthorizationRole,
  AuthorizationRoleSummary,
  AuthorizationScope,
  AuthorizationTemplate,
  AuthorizationUiErrorState,
  BulkTemplateUpgradePreview,
  BulkTemplateUpgradeRequest,
  RoleCatalogQuery,
  RoleStatus,
} from '../authorization-admin.models';
import { AuthorizationAdminError, AuthorizationAdminService } from '../authorization-admin.service';

const AGGREGATE_PAGE_LIMIT = 10;
const MAX_BULK_ROLE_COUNT = 100;

@Component({
  selector: 'authorization-role-list',
  templateUrl: './role-list.component.html',
  styleUrls: ['./role-list.component.scss'],
  standalone: false,
})
export class RoleListComponent implements OnInit {
  @Input() public scopeKeys: string[] = [];
  @Output() public readonly authorizationChanged = new EventEmitter<void>();
  @ViewChild('bulkUpgradeHeading') private bulkUpgradeHeading?: ElementRef<HTMLElement>;

  public roles: AuthorizationRoleSummary[] = [];
  public roleDetails = new Map<string, AuthorizationRole>();
  public assignmentCounts = new Map<string, number>();
  public assignmentCountsTruncated = false;
  public scopes: AuthorizationScope[] = [];
  public templates: AuthorizationTemplate[] = [];
  public nextCursor?: string;
  public loading = false;
  public pending = false;
  public error?: AuthorizationUiErrorState;
  public supportingErrors: AuthorizationUiErrorState[] = [];
  public scopeCatalogAvailable = false;
  public templateCatalogAvailable = false;
  public liveMessage = '';
  public editorOpen = false;
  public editorRoleKey?: string;

  public search = '';
  public status: RoleStatus | '' = '';
  public templateFilter = '';
  public selectedRoleIds = new Set<string>();
  public bulkTemplateKey = '';
  public bulkTargetRevision?: number;
  public bulkReason = '';
  public bulkPreview?: BulkTemplateUpgradePreview;
  public bulkPreviewReturnFocus?: HTMLElement;
  private bulkPreviewRequest?: BulkTemplateUpgradeRequest;
  private roleLoadId = 0;
  private editorReturnFocus?: HTMLElement;

  constructor(private readonly authorizationAdminService: AuthorizationAdminService) {}

  public get canManageRoles(): boolean {
    return this.scopeKeys.includes('authorization.role.manage');
  }
  public get canManageSystem(): boolean {
    return this.scopeKeys.includes('system.authorization.manage');
  }
  public get canReadAssignments(): boolean {
    return this.scopeKeys.includes('authorization.assignment.read');
  }
  public get canCreateRole(): boolean {
    return this.canManageRoles && this.scopeCatalogAvailable;
  }

  public async ngOnInit(): Promise<void> {
    const supportingRequests = [this.loadTemplates()];
    if (this.scopeKeys.includes('authorization.scope.read')) {
      supportingRequests.push(this.loadScopes());
    }
    const supportingResults = await Promise.allSettled(supportingRequests);
    this.supportingErrors = supportingResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => this.authorizationAdminService.toUiError(result.reason));
    await this.loadRoles(false);
    if (this.supportingErrors.length) {
      this.liveMessage = 'Some supporting role data could not be loaded. Unsafe controls remain unavailable.';
    }
  }

  public async loadRoles(append: boolean): Promise<void> {
    const loadId = ++this.roleLoadId;
    this.loading = true;
    this.liveMessage = 'Loading roles.';
    this.error = undefined;
    try {
      const query: RoleCatalogQuery = {
        limit: 50,
        ...(append && this.nextCursor ? { cursor: this.nextCursor } : {}),
        ...(this.search.trim() ? { search: this.search.trim() } : {}),
        ...(this.status ? { status: this.status } : {}),
        ...(this.templateFilter ? { templateKey: this.templateFilter } : {}),
      };
      const page = await this.authorizationAdminService.listRoles(query);
      if (loadId !== this.roleLoadId) return;
      if (!append) {
        this.selectedRoleIds = new Set();
        this.clearBulkPreview();
      }
      this.roles = append ? [...this.roles, ...page.items] : page.items;
      this.nextCursor = page.nextCursor;
      await Promise.all([
        this.loadRoleDetails(page.items, append, loadId),
        this.canReadAssignments ? this.loadAssignmentCounts(loadId) : Promise.resolve(),
      ]);
      if (loadId !== this.roleLoadId) return;
      this.liveMessage = `${this.roles.length} roles loaded.`;
    } catch (error) {
      if (loadId !== this.roleLoadId) return;
      this.setError(error);
    } finally {
      if (loadId === this.roleLoadId) this.loading = false;
    }
  }

  public resetFilters(): void {
    this.search = '';
    this.status = '';
    this.templateFilter = '';
    void this.loadRoles(false);
  }

  public openCreate(event?: Event): void {
    if (!this.canCreateRole) return;
    this.captureEditorTrigger(event);
    this.editorRoleKey = undefined;
    this.editorOpen = true;
  }
  public openEdit(roleKey: string, event?: Event): void {
    this.captureEditorTrigger(event);
    this.editorRoleKey = roleKey;
    this.editorOpen = true;
  }
  public closeEditor(): void {
    this.editorOpen = false;
    this.editorRoleKey = undefined;
    setTimeout(() => this.editorReturnFocus?.focus());
  }

  public async editorChanged(message: string): Promise<void> {
    this.liveMessage = message;
    await this.loadRoles(false);
    this.closeEditor();
    this.authorizationChanged.emit();
  }

  public overrideCount(role: AuthorizationRoleSummary): number | undefined {
    return this.roleDetails.get(role.id)?.overrides.length;
  }

  public assignmentCount(role: AuthorizationRoleSummary): string {
    if (!this.canReadAssignments) return 'Not available';
    const count = this.assignmentCounts.get(role.key) ?? 0;
    return this.assignmentCountsTruncated ? `${count}+` : String(count);
  }

  public toggleBulkRole(role: AuthorizationRoleSummary, checked: boolean): void {
    const selected = new Set(this.selectedRoleIds);
    if (checked && !selected.has(role.id) && selected.size >= MAX_BULK_ROLE_COUNT) {
      this.error = new AuthorizationAdminError(
        0,
        'authorization.bulk-limit',
        `Select no more than ${MAX_BULK_ROLE_COUNT} roles in one atomic upgrade.`
      );
      this.liveMessage = this.error.message;
      return;
    }
    if (checked) selected.add(role.id);
    else selected.delete(role.id);
    if (this.error?.code === 'authorization.bulk-limit') {
      this.error = undefined;
    }
    this.selectedRoleIds = selected;
    this.clearBulkPreview();
  }

  public onBulkRoleChange(role: AuthorizationRoleSummary, event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.toggleBulkRole(role, input.checked);
    }
  }

  public roleSelectableForBulk(role: AuthorizationRoleSummary): boolean {
    return Boolean(
      role.templateKey &&
      role.status === 'active' &&
      role.protectedKind === 'none' &&
      (this.selectedRoleIds.has(role.id) || this.selectedRoleIds.size < MAX_BULK_ROLE_COUNT) &&
      (!this.bulkTemplateKey || role.templateKey === this.bulkTemplateKey)
    );
  }

  public bulkTemplateChanged(): void {
    this.clearBulkPreview();
    const template = this.templates.find(candidate => candidate.key === this.bulkTemplateKey);
    this.bulkTargetRevision = template?.currentRevision;
    this.selectedRoleIds = new Set(
      [...this.selectedRoleIds].filter(id =>
        this.roles.some(role => role.id === id && role.templateKey === this.bulkTemplateKey)
      )
    );
  }

  public async previewBulkUpgrade(event?: Event): Promise<void> {
    if (!this.canManageSystem || !this.bulkTemplateKey || !this.bulkTargetRevision || !this.selectedRoleIds.size)
      return;
    this.bulkPreviewReturnFocus = event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
    this.pending = true;
    this.liveMessage = 'Requesting a server impact preview for the selected roles.';
    this.error = undefined;
    try {
      const request: BulkTemplateUpgradeRequest = {
        templateKey: this.bulkTemplateKey,
        targetRevision: this.bulkTargetRevision,
        roles: this.roles
          .filter(role => this.selectedRoleIds.has(role.id))
          .map(role => ({ roleId: role.id, expectedVersion: role.version })),
        ...(this.bulkReason.trim() ? { reason: this.bulkReason.trim() } : {}),
      };
      this.bulkPreview = await this.authorizationAdminService.previewBulkTemplateUpgrade(request);
      this.bulkPreviewRequest = request;
      this.liveMessage = 'Selected-role template upgrade preview ready.';
    } catch (error) {
      this.setError(error);
      queueMicrotask(() => this.bulkPreviewReturnFocus?.focus());
    } finally {
      this.pending = false;
    }
  }

  public async applyBulkUpgrade(): Promise<void> {
    if (!this.canManageSystem || !this.bulkPreview?.confirmationToken || !this.bulkPreviewRequest) return;
    this.pending = true;
    this.liveMessage = 'Applying the confirmed selected-role template upgrades.';
    try {
      await this.authorizationAdminService.applyBulkTemplateUpgrade({
        ...this.bulkPreviewRequest,
        confirmationToken: this.bulkPreview.confirmationToken,
      });
      this.clearBulkPreview();
      this.selectedRoleIds = new Set();
      await this.loadRoles(false);
      this.authorizationChanged.emit();
      this.liveMessage = 'Selected-role template upgrades applied.';
      setTimeout(() => this.bulkUpgradeHeading?.nativeElement.focus());
    } catch (error) {
      this.clearBulkPreview();
      this.setError(error);
    } finally {
      this.pending = false;
    }
  }

  private async loadScopes(): Promise<void> {
    this.scopeCatalogAvailable = false;
    let cursor: string | undefined;
    const scopes: AuthorizationScope[] = [];
    for (let pageNumber = 0; pageNumber < AGGREGATE_PAGE_LIMIT; pageNumber += 1) {
      const page = await this.authorizationAdminService.listScopes({ limit: 100, ...(cursor ? { cursor } : {}) });
      scopes.push(...page.items);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    if (cursor) {
      throw new AuthorizationAdminError(
        0,
        'authorization.scope-catalog-truncated',
        'The scope catalog exceeded the safe editor loading limit, so scope-changing controls are unavailable.'
      );
    }
    this.scopes = scopes;
    this.scopeCatalogAvailable = true;
  }

  private async loadTemplates(): Promise<void> {
    this.templateCatalogAvailable = false;
    let cursor: string | undefined;
    const templates: AuthorizationTemplate[] = [];
    for (let pageNumber = 0; pageNumber < AGGREGATE_PAGE_LIMIT; pageNumber += 1) {
      const page = await this.authorizationAdminService.listTemplates({ limit: 100, ...(cursor ? { cursor } : {}) });
      templates.push(...page.items);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    if (cursor) {
      throw new AuthorizationAdminError(
        0,
        'authorization.template-catalog-truncated',
        'The template catalog exceeded the safe editor loading limit, so template controls are unavailable.'
      );
    }
    this.templates = templates;
    this.templateCatalogAvailable = true;
  }

  private async loadRoleDetails(roles: AuthorizationRoleSummary[], append: boolean, loadId: number): Promise<void> {
    const details = await Promise.all(roles.map(role => this.authorizationAdminService.getRole(role.key)));
    if (loadId !== this.roleLoadId) return;
    const roleDetails = append ? new Map(this.roleDetails) : new Map<string, AuthorizationRole>();
    for (const detail of details) roleDetails.set(detail.id, detail);
    this.roleDetails = roleDetails;
  }

  private async loadAssignmentCounts(loadId: number): Promise<void> {
    const counts = new Map<string, number>();
    let cursor: string | undefined;
    let truncated = false;
    for (let pageNumber = 0; pageNumber < AGGREGATE_PAGE_LIMIT; pageNumber += 1) {
      const page = await this.authorizationAdminService.listAssignments({ limit: 100, ...(cursor ? { cursor } : {}) });
      for (const assignment of page.items) counts.set(assignment.roleKey, (counts.get(assignment.roleKey) ?? 0) + 1);
      cursor = page.nextCursor;
      if (!cursor) break;
      if (pageNumber === AGGREGATE_PAGE_LIMIT - 1) truncated = true;
    }
    if (loadId === this.roleLoadId) {
      this.assignmentCounts = counts;
      this.assignmentCountsTruncated = truncated;
    }
  }

  private setError(error: unknown): void {
    this.error = this.authorizationAdminService.toUiError(error);
    this.liveMessage = this.error.message;
  }

  public dismissBulkPreview(): void {
    this.clearBulkPreview();
  }

  private clearBulkPreview(): void {
    this.bulkPreview = undefined;
    this.bulkPreviewRequest = undefined;
  }

  private captureEditorTrigger(event?: Event): void {
    this.editorReturnFocus = event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
  }
}
