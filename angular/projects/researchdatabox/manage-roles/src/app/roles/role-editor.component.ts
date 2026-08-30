import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import {
  AuthorizationRole,
  AuthorizationRoleSummary,
  AuthorizationScope,
  AuthorizationTemplate,
  AuthorizationUiErrorState,
  CreateRoleRequest,
  RoleLifecycleRequest,
  RoleImpactPreview,
  RoleScopeRequest,
  RoleTemplateUpgradeRequest,
} from '../authorization-admin.models';
import { AuthorizationAdminService } from '../authorization-admin.service';

type RoleCreationKind = 'custom' | 'template' | 'clone';
type RolePreviewRequest =
  | { operation: 'role-scopes'; request: RoleScopeRequest }
  | { operation: 'template-upgrade'; request: RoleTemplateUpgradeRequest }
  | { operation: 'role-inactivate' | 'role-delete'; request: RoleLifecycleRequest };

const NEW_ROLE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

@Component({
  selector: 'authorization-role-editor',
  templateUrl: './role-editor.component.html',
  styleUrls: ['./role-editor.component.scss'],
  standalone: false,
})
export class RoleEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() public roleKey?: string;
  @Input() public scopes: AuthorizationScope[] = [];
  @Input() public templates: AuthorizationTemplate[] = [];
  @Input() public templatesAvailable = false;
  @Input() public cloneRoles: AuthorizationRoleSummary[] = [];
  @Input() public canManage = false;
  @Input() public scopeCatalogAvailable = false;
  @Input() public delegableScopeKeys: string[] = [];
  @Output() public readonly closed = new EventEmitter<void>();
  @Output() public readonly authorizationChanged = new EventEmitter<string>();
  @ViewChild('editorDialog') private editorDialog?: ElementRef<HTMLElement>;

  public role?: AuthorizationRole;
  public serverComparison?: AuthorizationRole;
  public clonePreview?: AuthorizationRole;
  public loading = false;
  public pending = false;
  public error?: AuthorizationUiErrorState;
  public liveMessage = '';
  public preview?: RoleImpactPreview;
  public previewApplyLabel = 'Apply confirmed change';
  public previewReturnFocus?: HTMLElement;

  public creationKind: RoleCreationKind = 'custom';
  public key = '';
  public displayName = '';
  public description = '';
  public reason = '';
  public selectedScopeKeys: string[] = [];
  public templateKey = '';
  public templateRevision?: number;
  public cloneRoleKey = '';
  public targetRevision?: number;

  private readonly previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  private creationSelectionLoadId = 0;
  private roleLoadId = 0;
  private previewRequest?: RolePreviewRequest;

  constructor(private readonly authorizationAdminService: AuthorizationAdminService) {}

  public get editing(): boolean {
    return Boolean(this.roleKey);
  }
  public get protectedRole(): boolean {
    return Boolean(this.role && this.role.protectedKind !== 'none');
  }
  public get serverOnlyScopeCount(): number {
    return this.serverComparison?.effectiveScopeKeys.filter(key => !this.selectedScopeKeys.includes(key)).length ?? 0;
  }
  public get editorOnlyScopeCount(): number {
    return this.selectedScopeKeys.filter(key => !this.serverComparison?.effectiveScopeKeys.includes(key)).length;
  }

  public async ngOnInit(): Promise<void> {
    if (this.roleKey) await this.loadRole(true);
  }

  public ngAfterViewInit(): void {
    queueMicrotask(() => this.editorDialog?.nativeElement.focus());
  }
  public ngOnDestroy(): void {
    setTimeout(() => this.previouslyFocused?.focus());
  }

  @HostListener('document:keydown.escape')
  public escape(): void {
    if (!this.pending && !this.preview) this.closed.emit();
  }

  public trapFocus(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    this.keepFocusInside(event, this.editorDialog?.nativeElement);
  }

  public async loadRole(resetInput: boolean): Promise<void> {
    if (!this.roleKey) return;
    const loadId = ++this.roleLoadId;
    this.loading = true;
    this.error = undefined;
    try {
      const current = await this.authorizationAdminService.getRole(this.roleKey);
      if (loadId !== this.roleLoadId) return;
      if (resetInput || !this.role) {
        this.applyRole(current);
        this.serverComparison = undefined;
        this.liveMessage = 'Latest server version loaded.';
      } else {
        this.serverComparison = current;
        this.liveMessage = 'Latest server version loaded for comparison; your input is unchanged.';
      }
    } catch (error) {
      if (loadId === this.roleLoadId) this.setError(error);
    } finally {
      if (loadId === this.roleLoadId) this.loading = false;
    }
  }

  public async creationSourceChanged(): Promise<void> {
    const loadId = ++this.creationSelectionLoadId;
    this.loading = true;
    this.error = undefined;
    this.clonePreview = undefined;
    this.selectedScopeKeys = [];
    if (this.creationKind === 'template' && this.templateKey) {
      const template = this.templates.find(candidate => candidate.key === this.templateKey);
      this.templateRevision = template?.currentRevision;
      if (template && this.templateRevision) {
        try {
          const revision = await this.authorizationAdminService.getTemplateRevision(
            template.key,
            this.templateRevision
          );
          if (loadId !== this.creationSelectionLoadId) return;
          this.selectedScopeKeys = [...revision.scopeKeys];
        } catch (error) {
          if (loadId === this.creationSelectionLoadId) this.setError(error);
        }
      }
    }
    if (this.creationKind === 'clone' && this.cloneRoleKey) {
      try {
        this.clonePreview = await this.authorizationAdminService.getRole(this.cloneRoleKey);
        if (loadId !== this.creationSelectionLoadId) return;
        this.selectedScopeKeys = [...this.clonePreview.effectiveScopeKeys];
      } catch (error) {
        if (loadId === this.creationSelectionLoadId) this.setError(error);
      }
    }
    if (loadId === this.creationSelectionLoadId) this.loading = false;
  }

  public async createRole(): Promise<void> {
    if (!this.canManage) return;
    const key = this.key.trim();
    const displayName = this.displayName.trim();
    if (!NEW_ROLE_KEY_PATTERN.test(key) || !displayName) {
      this.setClientError(
        'Enter a display label and a key that starts with a lowercase letter and contains only lowercase letters, numbers, or hyphens.'
      );
      return;
    }
    if (this.creationKind !== 'clone' && !this.scopeCatalogAvailable) {
      this.setClientError('The complete scope catalog must be loaded before creating this role.');
      return;
    }
    if (this.creationKind === 'template' && !this.templatesAvailable) {
      this.setClientError('The complete template catalog must be loaded before creating a template-based role.');
      return;
    }
    if (this.creationKind === 'template' && (!this.templateKey || !this.templateRevision)) {
      this.setClientError('Select a template revision before creating the role.');
      return;
    }
    if (this.creationKind === 'clone' && !this.cloneRoleKey) {
      this.setClientError('Select a same-brand role to clone.');
      return;
    }
    this.pending = true;
    this.liveMessage = 'Creating the role.';
    this.error = undefined;
    try {
      const commonRequest = {
        key,
        displayName,
        ...(this.description.trim() ? { description: this.description.trim() } : {}),
        ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
      };
      let request: CreateRoleRequest;
      if (this.creationKind === 'template') {
        request = {
          ...commonRequest,
          templateKey: this.templateKey,
          templateRevision: this.templateRevision,
          scopeKeys: [...this.selectedScopeKeys],
        };
      } else if (this.creationKind === 'clone') {
        request = { ...commonRequest, cloneRoleKey: this.cloneRoleKey };
      } else {
        request = { ...commonRequest, scopeKeys: [...this.selectedScopeKeys] };
      }
      await this.authorizationAdminService.createRole(request);
      this.authorizationChanged.emit(`Role ${key} created.`);
    } catch (error) {
      this.setError(error);
    } finally {
      this.pending = false;
    }
  }

  public async saveMetadata(): Promise<void> {
    if (!this.role || !this.canManage) return;
    if (!this.displayName.trim()) {
      this.setClientError('A display label is required.');
      return;
    }
    this.pending = true;
    this.liveMessage = 'Saving role metadata.';
    this.error = undefined;
    try {
      const result = await this.authorizationAdminService.updateRole(this.role.key, {
        expectedVersion: this.role.version,
        displayName: this.displayName.trim(),
        description: this.description.trim() || null,
        ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
      });
      this.applyRole(result.data);
      this.authorizationChanged.emit(`Role ${this.role.key} updated.`);
      this.liveMessage = 'Role metadata saved.';
    } catch (error) {
      this.setError(error);
    } finally {
      this.pending = false;
    }
  }

  public async previewScopes(event?: Event): Promise<void> {
    if (!this.role || !this.canManage || !this.scopeCatalogAvailable) return;
    this.capturePreviewTrigger(event);
    const request: RoleScopeRequest = {
      expectedVersion: this.role.version,
      scopeKeys: [...this.selectedScopeKeys],
      ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
    };
    await this.openPreview(
      this.authorizationAdminService.previewRoleScopes(this.role.key, request),
      'Apply scope change',
      { operation: 'role-scopes', request }
    );
  }

  public async previewTemplateUpgrade(event?: Event): Promise<void> {
    if (!this.role || !this.canManage || !this.targetRevision) return;
    this.capturePreviewTrigger(event);
    const request: RoleTemplateUpgradeRequest = {
      expectedVersion: this.role.version,
      targetRevision: this.targetRevision,
      ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
    };
    await this.openPreview(
      this.authorizationAdminService.previewRoleTemplateUpgrade(this.role.key, request),
      'Apply template upgrade',
      { operation: 'template-upgrade', request }
    );
  }

  public async previewInactivation(event?: Event): Promise<void> {
    if (!this.role || !this.canManage) return;
    this.capturePreviewTrigger(event);
    const request: RoleLifecycleRequest = {
      expectedVersion: this.role.version,
      ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
    };
    await this.openPreview(
      this.authorizationAdminService.previewRoleInactivation(this.role.key, request),
      'Inactivate role',
      { operation: 'role-inactivate', request }
    );
  }

  public async previewDeletion(event?: Event): Promise<void> {
    if (!this.role || !this.canManage) return;
    this.capturePreviewTrigger(event);
    const request: RoleLifecycleRequest = {
      expectedVersion: this.role.version,
      ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
    };
    await this.openPreview(
      this.authorizationAdminService.previewRoleDeletion(this.role.key, request),
      'Delete eligible role',
      { operation: 'role-delete', request }
    );
  }

  public async applyPreview(): Promise<void> {
    if (!this.role || !this.canManage || !this.preview?.confirmationToken || !this.previewRequest) return;
    this.pending = true;
    this.liveMessage = 'Applying the confirmed server preview.';
    this.error = undefined;
    try {
      const confirmationToken = this.preview.confirmationToken;
      if (this.previewRequest.operation === 'role-scopes') {
        await this.authorizationAdminService.applyRoleScopes(this.role.key, {
          ...this.previewRequest.request,
          confirmationToken,
        });
      } else if (this.previewRequest.operation === 'template-upgrade') {
        await this.authorizationAdminService.applyRoleTemplateUpgrade(this.role.key, {
          ...this.previewRequest.request,
          confirmationToken,
        });
      } else if (this.previewRequest.operation === 'role-inactivate') {
        await this.authorizationAdminService.inactivateRole(this.role.key, {
          ...this.previewRequest.request,
          confirmationToken,
        });
      } else {
        await this.authorizationAdminService.deleteRole(this.role.key, {
          ...this.previewRequest.request,
          confirmationToken,
        });
        this.authorizationChanged.emit(`Role ${this.role.key} deleted.`);
        this.clearPreview();
        return;
      }
      const operation = this.preview.operation;
      this.clearPreview();
      await this.loadRole(true);
      this.authorizationChanged.emit(`Confirmed ${operation} change applied.`);
    } catch (error) {
      this.clearPreview();
      this.setError(error);
    } finally {
      this.pending = false;
    }
  }

  public dismissPreview(): void {
    this.clearPreview();
  }

  private async openPreview(
    previewPromise: Promise<RoleImpactPreview>,
    applyLabel: string,
    request: RolePreviewRequest
  ): Promise<void> {
    this.pending = true;
    this.liveMessage = 'Requesting a server impact preview.';
    this.error = undefined;
    try {
      this.preview = await previewPromise;
      this.previewRequest = request;
      this.previewApplyLabel = applyLabel;
      this.liveMessage = `${this.preview.operation} preview ready.`;
    } catch (error) {
      this.setError(error);
      queueMicrotask(() => this.previewReturnFocus?.focus());
    } finally {
      this.pending = false;
    }
  }

  private applyRole(role: AuthorizationRole): void {
    this.role = role;
    this.displayName = role.displayName;
    this.description = role.description ?? '';
    this.selectedScopeKeys = [...role.effectiveScopeKeys];
    this.targetRevision = role.templateRevision ? role.templateRevision + 1 : undefined;
  }

  private setError(error: unknown): void {
    this.error = this.authorizationAdminService.toUiError(error);
    this.liveMessage = this.error.message;
  }

  private setClientError(message: string): void {
    this.error = { status: 0, code: 'authorization.invalid-input', message, isConflict: false };
    this.liveMessage = message;
  }

  private clearPreview(): void {
    this.preview = undefined;
    this.previewRequest = undefined;
  }

  private capturePreviewTrigger(event?: Event): void {
    this.previewReturnFocus = event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
  }

  private keepFocusInside(event: KeyboardEvent, container?: HTMLElement): void {
    if (!container) return;
    const controls = Array.from(
      container.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]')
    ).filter(element => !element.hasAttribute('disabled') && element.tabIndex >= 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
