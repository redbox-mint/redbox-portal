import { Component, Inject, OnDestroy } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import {
  DashboardConfigApiService,
  DashboardConfigInfo,
  DashboardTableConfig,
  DashboardTableOverrideConfigData
} from './dashboard-config-api.service';

type SelectedContext =
  | { type: 'recordType'; recordType: string; step: string }
  | { type: 'view'; view: string; step: string }
  | { type: 'dashboardType'; dashboardType: string };

@Component({
  selector: 'dashboard-config-editor',
  templateUrl: './dashboard-config-editor.component.html',
  styleUrls: ['./dashboard-config-editor.component.scss'],
  standalone: false
})
export class DashboardConfigEditorComponent extends BaseComponent implements OnDestroy {
  configInfo: DashboardConfigInfo | null = null;
  overrides: DashboardTableOverrideConfigData = { recordTypes: {}, views: {}, dashboardTypes: {} };
  defaults: Record<string, unknown> = {};
  selectedContext: SelectedContext | null = null;
  currentConfig: DashboardTableConfig = {};
  loading = false;
  saving = false;
  message = '';
  error = '';

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(DashboardConfigApiService) private api: DashboardConfigApiService
  ) {
    super();
    this.initDependencies = [this.translationService, this.api];
  }

  protected override async initComponent(): Promise<void> {
    this.loading = true;
    try {
      this.configInfo = await this.api.getConfigInfo();
      this.overrides = await this.api.getOverrides();
    } catch (e) {
      this.error = 'Failed to load configuration info.';
      this.logger.error('Failed to load dashboard config info', e);
    }
    this.loading = false;
  }

  selectRecordType(recordType: string, step: string): void {
    this.selectedContext = { type: 'recordType', recordType, step };
    this.loadDefaultsAndConfig();
  }

  selectView(view: string, step: string): void {
    this.selectedContext = { type: 'view', view, step };
    this.loadDefaultsAndConfig();
  }

  selectDashboardType(dashboardType: string): void {
    this.selectedContext = { type: 'dashboardType', dashboardType };
    this.loadDefaultsAndConfig();
  }

  private async loadDefaultsAndConfig(): Promise<void> {
    if (!this.selectedContext) return;
    this.loading = true;
    try {
      if (this.selectedContext.type === 'recordType') {
        const { recordType, step } = this.selectedContext;
        this.defaults = await this.api.getDefaults({ recordType, workflowStage: step });
        const merged = await this.api.getMergedConfig(recordType, step);
        this.currentConfig = merged ?? {};
      } else if (this.selectedContext.type === 'view') {
        const { view, step } = this.selectedContext;
        this.defaults = await this.api.getDefaults({ viewName: view, stepName: step });
        const merged = await this.api.getMergedViewConfig(view, step);
        this.currentConfig = merged ?? {};
      } else if (this.selectedContext.type === 'dashboardType') {
        const { dashboardType } = this.selectedContext;
        this.defaults = await this.api.getDefaults({ dashboardType });
        this.currentConfig = {};
      }
    } catch (e) {
      this.error = 'Failed to load configuration.';
      this.logger.error('Failed to load dashboard config', e);
    }
    this.loading = false;
  }

  async save(): Promise<void> {
    if (!this.selectedContext) return;
    this.saving = true;
    this.message = '';
    this.error = '';
    try {
      const overrides = JSON.parse(JSON.stringify(this.overrides)) as DashboardTableOverrideConfigData;
      if (this.selectedContext.type === 'recordType') {
        const { recordType, step } = this.selectedContext;
        if (!overrides.recordTypes) { overrides.recordTypes = {}; }
        if (!overrides.recordTypes[recordType]) { overrides.recordTypes[recordType] = {}; }
        if (!overrides.recordTypes[recordType].steps) { overrides.recordTypes[recordType].steps = {}; }
        overrides.recordTypes[recordType].steps[step] = this.currentConfig;
      } else if (this.selectedContext.type === 'view') {
        const { view, step } = this.selectedContext;
        if (!overrides.views) { overrides.views = {}; }
        if (!overrides.views[view]) { overrides.views[view] = {}; }
        if (!overrides.views[view].steps) { overrides.views[view].steps = {}; }
        overrides.views[view].steps[step] = this.currentConfig;
      }
      this.overrides = await this.api.saveOverrides(overrides);
      this.message = 'Saved successfully.';
    } catch (e) {
      this.error = 'Failed to save configuration.';
      this.logger.error('Failed to save dashboard config', e);
    }
    this.saving = false;
  }

  get contextLabel(): string {
    if (!this.selectedContext) return '';
    if (this.selectedContext.type === 'recordType') {
      return `${this.selectedContext.recordType} / ${this.selectedContext.step}`;
    }
    if (this.selectedContext.type === 'view') {
      return `View: ${this.selectedContext.view} / ${this.selectedContext.step}`;
    }
    return `Dashboard Type: ${this.selectedContext.dashboardType}`;
  }
}
