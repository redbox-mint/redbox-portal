import { Component, OnDestroy, inject } from '@angular/core';
import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  TranslationService,
  WorkspaceTypeService,
} from '@researchdatabox/portal-ng-common';
import {
  WorkspaceSelectorComponentName,
  WorkspaceDisplayType,
  WorkspaceFieldComponentConfigOutline,
  WorkspaceTypeDefinition,
} from '@researchdatabox/sails-ng-common';
import { template as lodashTemplate } from 'lodash-es';
import { Subscription } from 'rxjs';
import { FormComponentEventBus, FormComponentEventType, createFormSaveRequestedEvent } from '../form-state';

@Component({
  selector: 'redbox-form-workspace',
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
  standalone: false,
})
export class WorkspaceSelectorComponent extends FormFieldBaseComponent<undefined> implements OnDestroy {
  protected override logName = WorkspaceSelectorComponentName;
  private readonly workspaceTypeService = inject(WorkspaceTypeService);
  private readonly translationService = inject(TranslationService);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly subscriptions = new Subscription();

  workspaceApps: WorkspaceTypeDefinition[] = [];
  workspaceApp?: WorkspaceTypeDefinition;
  open = 'Open';
  saveFirst = 'Please save this record first';
  displayType: WorkspaceDisplayType = 'dropdown';
  shouldSaveForm = true;
  allowAddTemplate?: string;
  rdmp = '';
  allowAdd = false;
  loading = false;
  loadError = '';
  launchPending = false;
  private pendingWorkspace?: WorkspaceTypeDefinition;

  protected override setPropertiesFromComponentMapEntry(entry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(entry);
    const config = (this.componentDefinition?.config ?? {}) as WorkspaceFieldComponentConfigOutline;
    this.open = String(config.open ?? 'Open');
    this.saveFirst = String(config.saveFirst ?? 'Please save this record first');
    this.displayType = ['dropdown', 'cards', 'panels'].includes(String(config.displayType))
      ? (config.displayType as WorkspaceDisplayType)
      : 'dropdown';
    this.shouldSaveForm = config.shouldSaveForm !== false;
    this.allowAddTemplate = typeof config.allowAddTemplate === 'string' ? config.allowAddTemplate : undefined;
    this.workspaceApps = this.normalizeTypes(config.defaultSelection);
    this.workspaceApp = this.workspaceApps[0];
    this.rdmp = String(this.formComponent?.trimmedParams?.oid?.() ?? '').trim();
    this.updateAllowAdd();
  }

  protected override async initData(): Promise<void> {
    this.loading = true;
    this.loadError = '';
    try {
      const response = await this.workspaceTypeService.getWorkspaceTypes();
      if (!response.status) throw new Error('Workspace types request was unsuccessful.');
      this.mergeWorkspaceTypes(response.workspaceTypes);
    } catch (error) {
      this.loadError = 'Unable to load workspace types';
      this.loggerService.warn(`${this.logName}: ${this.loadError}. Using configured defaults.`, error);
    } finally {
      this.loading = false;
    }
  }

  protected override async initEventHandlers(): Promise<void> {
    this.subscriptions.add(
      this.eventBus.select$(FormComponentEventType.FORM_SAVE_SUCCESS).subscribe(event => {
        this.rdmp = String(event.oid ?? this.formComponent?.trimmedParams?.oid?.() ?? '').trim();
        this.updateAllowAdd(event.savedData);
        if (this.launchPending && this.pendingWorkspace && this.rdmp) this.navigate(this.pendingWorkspace, this.rdmp);
        this.clearPendingLaunch();
      })
    );
    this.subscriptions.add(
      this.eventBus.select$(FormComponentEventType.FORM_SAVE_FAILURE).subscribe(() => this.clearPendingLaunch())
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  selectWorkspace(name: string): void {
    this.workspaceApp = this.workspaceApps.find(item => item.name === name);
  }

  async openWorkspace(workspace: WorkspaceTypeDefinition | undefined = this.workspaceApp): Promise<void> {
    if (
      !workspace ||
      workspace.externallyProvisioned === true ||
      !this.allowAdd ||
      this.isDisabled ||
      this.isReadonly ||
      this.launchPending
    )
      return;
    const oid = this.rdmp.trim();
    if (!oid) return;
    const form = this.formComponent?.form;
    if (!this.shouldSaveForm || !form?.dirty) {
      this.navigate(workspace, oid);
      return;
    }
    this.launchPending = true;
    this.pendingWorkspace = workspace;
    this.eventBus.publish(
      createFormSaveRequestedEvent({
        enabledValidationGroups: this.formComponent?.enabledValidationGroups ?? [],
        sourceId: this.name ?? undefined,
      })
    );
  }

  translate(value?: string): string {
    return String(this.translationService.t(value ?? ''));
  }
  trackWorkspace(_index: number, item: WorkspaceTypeDefinition): string {
    return item.name;
  }

  private normalizeTypes(items: unknown): WorkspaceTypeDefinition[] {
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (item): item is WorkspaceTypeDefinition =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as WorkspaceTypeDefinition).name === 'string' &&
          (item as WorkspaceTypeDefinition).name.trim().length > 0
      )
      .map(item => ({ ...item }));
  }

  private mergeWorkspaceTypes(serverTypes: WorkspaceTypeDefinition[]): void {
    const merged = this.workspaceApps.map(item => ({ ...item }));
    for (const serverType of this.normalizeTypes(serverTypes)) {
      const index = merged.findIndex(item => item.name === serverType.name);
      if (index >= 0) merged[index] = { ...merged[index], ...serverType };
      else merged.push(serverType);
    }
    const selectedName = this.workspaceApp?.name;
    this.workspaceApps = merged;
    this.workspaceApp = merged.find(item => item.name === selectedName) ?? merged[0];
  }

  private updateAllowAdd(data?: unknown): void {
    if (!this.rdmp) {
      this.allowAdd = false;
      return;
    }
    if (!this.allowAddTemplate?.trim()) {
      this.allowAdd = true;
      return;
    }
    try {
      const rendered = lodashTemplate(this.allowAddTemplate, { imports: { imports: this } })({ data });
      this.allowAdd = String(rendered).trim() === 'true';
    } catch (error) {
      this.allowAdd = false;
      this.loggerService.warn(`${this.logName}: Failed to evaluate allowAddTemplate.`, error);
    }
  }

  private navigate(workspace: WorkspaceTypeDefinition, oid: string): void {
    const path = `${this.workspaceTypeService.brandingAndPortalUrl}/record/${encodeURIComponent(workspace.name)}/edit?rdmp=${encodeURIComponent(oid)}`;
    this.formComponent.changeLocationHref(path);
  }

  private clearPendingLaunch(): void {
    this.launchPending = false;
    this.pendingWorkspace = undefined;
  }
}
