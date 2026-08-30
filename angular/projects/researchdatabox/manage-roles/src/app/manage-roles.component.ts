import { Component, ElementRef, Inject, QueryList, ViewChildren } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { AuthorizationMe, AuthorizationUiErrorState } from './authorization-admin.models';
import { AuthorizationAdminService } from './authorization-admin.service';

export type AuthorizationAdminTab = 'roles' | 'assignments' | 'scopes' | 'audit';

interface TabDefinition {
  id: AuthorizationAdminTab;
  label: string;
  requiredScope: string;
}

@Component({
  selector: 'manage-roles',
  templateUrl: './manage-roles.component.html',
  styleUrls: ['./manage-roles.component.scss'],
  standalone: false,
})
export class ManageRolesComponent extends BaseComponent {
  public readonly tabs: TabDefinition[] = [
    { id: 'roles', label: 'Roles', requiredScope: 'authorization.role.read' },
    { id: 'assignments', label: 'Assignments', requiredScope: 'authorization.assignment.read' },
    { id: 'scopes', label: 'Scope Catalog', requiredScope: 'authorization.scope.read' },
    { id: 'audit', label: 'Audit', requiredScope: 'authorization.audit.read' },
  ];

  public projection?: AuthorizationMe;
  public activeTab?: AuthorizationAdminTab;
  public loadingProjection = false;
  public projectionError?: AuthorizationUiErrorState;
  public liveMessage = '';

  @ViewChildren('tabButton') private tabButtons?: QueryList<ElementRef<HTMLButtonElement>>;
  private projectionRequestId = 0;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(TranslationService) translationService: TranslationService,
    @Inject(AuthorizationAdminService) private readonly authorizationAdminService: AuthorizationAdminService
  ) {
    super();
    this.initDependencies = [translationService, authorizationAdminService];
  }

  public get availableTabs(): TabDefinition[] {
    return this.tabs.filter(tab => this.hasScope(tab.requiredScope));
  }

  public get stagedRollout(): boolean {
    return this.projection?.rolloutMode === 'legacy' || this.projection?.rolloutMode === 'shadow';
  }

  public hasScope(scopeKey: string): boolean {
    return this.projection?.scopeKeys.includes(scopeKey) ?? false;
  }

  protected override async initComponent(): Promise<void> {
    const requestedTab = new URL(window.location.href).searchParams.get('tab');
    await this.reloadProjection(false);
    const fallback = this.availableTabs[0]?.id;
    this.activeTab =
      this.isAuthorizationAdminTab(requestedTab) && this.availableTabs.some(tab => tab.id === requestedTab)
        ? requestedTab
        : fallback;
    this.persistTab();
    this.loggerService.debug('Authorization administration app initialized.');
  }

  public async reloadProjection(announce = true): Promise<void> {
    const requestId = ++this.projectionRequestId;
    this.loadingProjection = true;
    this.projectionError = undefined;
    try {
      const projection = await this.authorizationAdminService.getMe();
      if (requestId !== this.projectionRequestId) {
        return;
      }
      this.projection = projection;
      if (!this.availableTabs.some(tab => tab.id === this.activeTab)) {
        this.activeTab = this.availableTabs[0]?.id;
        this.persistTab();
      }
      if (announce) {
        this.liveMessage = 'Authorization state refreshed after the change.';
      }
    } catch (error) {
      if (requestId !== this.projectionRequestId) {
        return;
      }
      this.projection = undefined;
      this.activeTab = undefined;
      this.projectionError = this.authorizationAdminService.toUiError(error);
      this.liveMessage = this.projectionError.message;
    } finally {
      if (requestId === this.projectionRequestId) {
        this.loadingProjection = false;
      }
    }
  }

  public selectTab(tab: AuthorizationAdminTab, focus = false): void {
    if (!this.availableTabs.some(candidate => candidate.id === tab)) {
      return;
    }
    this.activeTab = tab;
    this.persistTab();
    if (focus) {
      queueMicrotask(() => this.focusActiveTab());
    }
  }

  public onTabKeydown(event: KeyboardEvent, currentIndex: number): void {
    const tabs = this.availableTabs;
    if (!tabs.length) {
      return;
    }
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex !== undefined) {
      event.preventDefault();
      this.selectTab(tabs[nextIndex].id, true);
    }
  }

  private persistTab(): void {
    if (!this.activeTab) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('tab', this.activeTab);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  private focusActiveTab(): void {
    this.tabButtons
      ?.find(button => button.nativeElement.id === `authorization-tab-${this.activeTab}`)
      ?.nativeElement.focus();
  }

  private isAuthorizationAdminTab(value: string | null): value is AuthorizationAdminTab {
    return value !== null && this.tabs.some(tab => tab.id === value);
  }
}
