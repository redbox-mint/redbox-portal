import { Component, Inject, OnDestroy } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import {
  DashboardConfigApiService,
  DashboardConfigInfo,
  DashboardTableConfig,
  DashboardTableOverrideConfigData,
  DashboardTypeDefinition,
  MergedDashboardConfigResult,
  WorkflowStateDashboardConfig
} from './dashboard-config-api.service';

type SelectedContext =
  | { type: 'recordType'; recordType: string; step: string }
  | { type: 'view'; view: string; step: string }
  | { type: 'dashboardType'; name: string };

type NavSection = 'types' | 'records' | 'views';

@Component({
  selector: 'dashboard-config-editor',
  templateUrl: './dashboard-config-editor.component.html',
  styleUrls: ['./dashboard-config-editor.component.scss'],
  standalone: false
})
export class DashboardConfigEditorComponent extends BaseComponent implements OnDestroy {
  configInfo: DashboardConfigInfo | null = null;
  overrides: DashboardTableOverrideConfigData = { recordTypes: {}, views: {} };
  selectedContext: SelectedContext | null = null;
  selectedMergedConfig: MergedDashboardConfigResult | null = null;
  currentDashboardTypeName = 'standard';
  currentOverrideConfig: DashboardTableConfig = {};
  dashboardTypeForm: DashboardTypeDefinition = this.emptyDashboardType();
  dashboardTypeIsNew = true;
  loading = false;
  saving = false;
  message = '';
  error = '';
  navFilter = '';
  private collapsedNavSections = new Set<NavSection>();

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(DashboardConfigApiService) private api: DashboardConfigApiService
  ) {
    super();
    this.initDependencies = [this.translationService, this.api];
  }

  protected override async initComponent(): Promise<void> {
    await this.reloadMetadata();
  }

  private emptyDashboardType(): DashboardTypeDefinition {
    return {
      name: '',
      description: '',
      searchable: true,
      system: false,
      formatRules: {},
      tableConfig: { rowConfig: [] }
    };
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value ?? {})) as T;
  }

  private async reloadMetadata(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.configInfo = await this.api.getConfigInfo();
      this.overrides = await this.api.getOverrides();
      if (!this.selectedContext && this.configInfo.dashboardTypes.length > 0) {
        await this.selectDashboardType(this.configInfo.dashboardTypes[0].name);
      }
    } catch (e) {
      this.error = 'Failed to load dashboard configuration metadata.';
      this.logger.error('Failed to load dashboard config info', e);
    }
    this.loading = false;
  }

  async selectRecordType(recordType: string, step: string): Promise<void> {
    this.selectedContext = { type: 'recordType', recordType, step };
    await this.loadMergedSelection();
  }

  async selectView(view: string, step: string): Promise<void> {
    this.selectedContext = { type: 'view', view, step };
    await this.loadMergedSelection();
  }

  async selectDashboardType(name: string): Promise<void> {
    this.selectedContext = { type: 'dashboardType', name };
    this.dashboardTypeIsNew = false;
    const selected = this.configInfo?.dashboardTypes.find((type) => type.name === name) ?? await this.api.getDashboardType(name);
    this.dashboardTypeForm = selected ? this.clone(selected) : this.emptyDashboardType();
    this.selectedMergedConfig = null;
    this.currentOverrideConfig = {};
    this.currentDashboardTypeName = this.dashboardTypeForm.name || name;
  }

  startNewDashboardType(): void {
    this.selectedContext = { type: 'dashboardType', name: '' };
    this.dashboardTypeIsNew = true;
    this.dashboardTypeForm = this.emptyDashboardType();
    this.selectedMergedConfig = null;
    this.currentOverrideConfig = {};
    this.currentDashboardTypeName = 'standard';
  }

  private async loadMergedSelection(): Promise<void> {
    if (!this.selectedContext) {
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      if (this.selectedContext.type === 'recordType') {
        this.selectedMergedConfig = await this.api.getMergedConfig(this.selectedContext.recordType, this.selectedContext.step);
      } else if (this.selectedContext.type === 'view') {
        this.selectedMergedConfig = await this.api.getMergedViewConfig(this.selectedContext.view, this.selectedContext.step);
      }

      this.currentDashboardTypeName = this.selectedMergedConfig?.dashboardType ?? 'standard';
      this.currentOverrideConfig = this.clone(this.selectedMergedConfig?.overrideConfig ?? {});
    } catch (e) {
      this.error = 'Failed to load selected dashboard configuration.';
      this.logger.error('Failed to load dashboard config selection', e);
    }
    this.loading = false;
  }

  get selectedRecordTypes(): Array<{ name: string; steps: string[] }> {
    return this.configInfo?.recordTypes ?? [];
  }

  get selectedViews(): Array<{ name: string; steps: string[] }> {
    return this.configInfo?.views ?? [];
  }

  get currentTypeDefinition(): DashboardTypeDefinition | null {
    if (this.selectedContext?.type !== 'dashboardType') {
      return null;
    }
    const selected = this.selectedContext as Extract<SelectedContext, { type: 'dashboardType' }>;
    return this.configInfo?.dashboardTypes.find((type) => type.name === selected.name) ?? null;
  }

  isSelectedDashboardType(name: string): boolean {
    return this.selectedContext?.type === 'dashboardType' && (this.selectedContext as Extract<SelectedContext, { type: 'dashboardType' }>).name === name;
  }

  isSelectedRecordType(recordType: string, step: string): boolean {
    return this.selectedContext?.type === 'recordType'
      && (this.selectedContext as Extract<SelectedContext, { type: 'recordType' }>).recordType === recordType
      && (this.selectedContext as Extract<SelectedContext, { type: 'recordType' }>).step === step;
  }

  isSelectedView(view: string, step: string): boolean {
    return this.selectedContext?.type === 'view'
      && (this.selectedContext as Extract<SelectedContext, { type: 'view' }>).view === view
      && (this.selectedContext as Extract<SelectedContext, { type: 'view' }>).step === step;
  }

  hasRecordOverride(recordType: string, step: string): boolean {
    const entry = this.overrides?.recordTypes?.[recordType];
    return !!(entry?.steps && entry.steps[step]);
  }

  hasViewOverride(view: string, step: string): boolean {
    const entry = this.overrides?.views?.[view];
    return !!(entry?.steps && entry.steps[step]);
  }

  get hasOverrideContent(): boolean {
    const c = this.currentOverrideConfig || {};
    return !!(
      (c.rowConfig && c.rowConfig.length) ||
      (c.formatRules && Object.keys(c.formatRules).length) ||
      (c.rowRulesConfig && c.rowRulesConfig.length) ||
      (c.groupRowConfig && c.groupRowConfig.length) ||
      (c.groupRowRulesConfig && c.groupRowRulesConfig.length)
    );
  }

  toggleNavSection(section: NavSection): void {
    if (this.collapsedNavSections.has(section)) {
      this.collapsedNavSections.delete(section);
    } else {
      this.collapsedNavSections.add(section);
    }
  }

  isNavSectionCollapsed(section: NavSection): boolean {
    return this.collapsedNavSections.has(section);
  }

  onNavFilterChange(): void {
    // Filtering is reactive via getters — this is here for future debounce hooks.
  }

  clearNavFilter(): void {
    this.navFilter = '';
  }

  private matchesFilter(value: string): boolean {
    const term = this.navFilter.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return value.toLowerCase().includes(term);
  }

  get filteredTypeList(): DashboardTypeDefinition[] {
    return this.typeList.filter((type) =>
      this.matchesFilter(type.name) || (type.description ? this.matchesFilter(type.description) : false)
    );
  }

  get filteredRecordTypes(): Array<{ name: string; steps: string[] }> {
    return this.selectedRecordTypes
      .map((rt) => {
        if (this.matchesFilter(rt.name)) {
          return rt;
        }
        const steps = rt.steps.filter((step) => this.matchesFilter(step));
        return steps.length ? { name: rt.name, steps } : null;
      })
      .filter((rt): rt is { name: string; steps: string[] } => rt !== null);
  }

  get filteredRecordTypeCount(): number {
    return this.filteredRecordTypes.reduce((acc, rt) => acc + rt.steps.length, 0);
  }

  get filteredViews(): Array<{ name: string; steps: string[] }> {
    return this.selectedViews
      .map((v) => {
        if (this.matchesFilter(v.name)) {
          return v;
        }
        const steps = v.steps.filter((step) => this.matchesFilter(step));
        return steps.length ? { name: v.name, steps } : null;
      })
      .filter((v): v is { name: string; steps: string[] } => v !== null);
  }

  get filteredViewCount(): number {
    return this.filteredViews.reduce((acc, v) => acc + v.steps.length, 0);
  }

  async save(): Promise<void> {
    if (!this.selectedContext) {
      return;
    }

    this.saving = true;
    this.message = '';
    this.error = '';

    try {
      if (this.selectedContext.type === 'dashboardType') {
        const payload = this.clone(this.dashboardTypeForm);
        payload.tableConfig = payload.tableConfig ?? { rowConfig: [] };
        if (this.dashboardTypeIsNew) {
          if (!payload.name.trim()) {
            throw new Error('Dashboard type name is required');
          }
          await this.api.createDashboardType(payload);
          this.message = `Created dashboard type ${payload.name}.`;
        } else {
          await this.api.updateDashboardType(this.selectedContext.name, payload);
          this.message = `Saved dashboard type ${payload.name}.`;
        }
        await this.reloadMetadata();
        await this.selectDashboardType(payload.name);
      } else {
        const payload: WorkflowStateDashboardConfig = {
          dashboardType: this.currentDashboardTypeName,
          tableConfig: this.currentOverrideConfig
        };

        if (this.selectedContext.type === 'recordType') {
          await this.api.saveWorkflowStateDashboardConfig(this.selectedContext.recordType, this.selectedContext.step, payload);
          this.message = 'Saved workflow state configuration.';
          this.overrides = await this.api.getOverrides();
          await this.loadMergedSelection();
        } else if (this.selectedContext.type === 'view') {
          await this.api.saveDashboardViewStepConfig(this.selectedContext.view, this.selectedContext.step, payload);
          this.message = 'Saved dashboard view step configuration.';
          this.overrides = await this.api.getOverrides();
          await this.loadMergedSelection();
        }
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to save dashboard configuration.';
      this.logger.error('Failed to save dashboard config', e);
    } finally {
      this.saving = false;
    }
  }

  async duplicateDashboardType(): Promise<void> {
    if (this.selectedContext?.type !== 'dashboardType' || !this.currentTypeDefinition) {
      return;
    }
    const proposedName = window.prompt('New dashboard type name', `${this.currentTypeDefinition.name}-copy`)?.trim();
    if (!proposedName) {
      return;
    }
    const clone = this.clone(this.currentTypeDefinition);
    clone.name = proposedName;
    clone.system = false;
    this.dashboardTypeForm = clone;
    this.dashboardTypeIsNew = true;
    this.selectedContext = { type: 'dashboardType', name: proposedName };
    await this.save();
  }

  async deleteDashboardType(): Promise<void> {
    if (this.selectedContext?.type !== 'dashboardType' || !this.currentTypeDefinition) {
      return;
    }
    if (!window.confirm(`Delete dashboard type "${this.currentTypeDefinition.name}"?`)) {
      return;
    }
    try {
      await this.api.deleteDashboardType(this.currentTypeDefinition.name);
      this.message = `Deleted dashboard type ${this.currentTypeDefinition.name}.`;
      this.selectedContext = null;
      this.dashboardTypeForm = this.emptyDashboardType();
      await this.reloadMetadata();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to delete dashboard type.';
      this.logger.error('Failed to delete dashboard type', e);
    }
  }

  get contextLabel(): string {
    if (!this.selectedContext) {
      return '';
    }
    if (this.selectedContext.type === 'recordType') {
      return `${this.selectedContext.recordType} / ${this.selectedContext.step}`;
    }
    if (this.selectedContext.type === 'view') {
      return `${this.selectedContext.view} / ${this.selectedContext.step}`;
    }
    return this.dashboardTypeIsNew ? 'New Dashboard Type' : this.selectedContext.name;
  }

  get typeList(): DashboardTypeDefinition[] {
    return this.configInfo?.dashboardTypes ?? [];
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }
}
