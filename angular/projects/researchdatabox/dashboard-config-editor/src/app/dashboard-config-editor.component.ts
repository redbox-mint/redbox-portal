import { Component, HostListener, Inject, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import {
  DashboardConfigApiError,
  DashboardConfigApiService,
  DashboardCopyPreview,
  DashboardCopySelection,
  DashboardFieldCatalogue,
  DashboardFinding,
  DashboardGroupChange,
  DashboardSettings,
  DashboardTableConfig,
  DashboardTargetInfo
} from './dashboard-config-api.service';
import { COPY_GROUPS, applyCopyGroups, cloneSettings, describeGroupChanges, selectionToGroups } from './dashboard-settings.util';

type SelectionState = Record<DashboardCopySelection, boolean>;

function emptySelection(): SelectionState {
  return { columnsAndActions: false, filtersAndSearch: false, grouping: false, all: false };
}

@Component({
  selector: 'dashboard-config-editor',
  templateUrl: './dashboard-config-editor.component.html',
  styleUrls: ['./dashboard-config-editor.component.scss'],
  standalone: false
})
export class DashboardConfigEditorComponent extends BaseComponent implements OnDestroy {
  readonly copyGroups = COPY_GROUPS;
  private focusEditor = false;
  @ViewChild('editorHeading') set editorHeading(heading: ElementRef<HTMLElement> | undefined) {
    if (heading && this.focusEditor) {
      this.focusEditor = false;
      heading.nativeElement.scrollIntoView({ block: 'start' });
      heading.nativeElement.focus({ preventScroll: true });
    }
  }

  targets: DashboardTargetInfo[] = [];
  recordTypes: string[] = [];
  selected: DashboardTargetInfo | null = null;
  draft: DashboardSettings | null = null;
  baseRevision = 0;
  private savedJson = '';
  private loadGeneration = 0;
  private copyFromGeneration = 0;
  /** Record fields for the selected target, from its record JSON schema. */
  fieldCatalogue: DashboardFieldCatalogue | null = null;

  loading = false;
  saving = false;
  message = '';
  error = '';
  navFilter = '';
  override brandingAndPortalUrl = '';
  targetsLoading = false;
  targetsError = '';
  loadFailed = false;
  columnCounts = new Map<string, number>();
  pendingLeave = '';
  private allowLeave = false;
  private dialogTrigger: HTMLElement | null = null;
  copyConfirmation: 'from' | 'to' | null = null;

  /** Findings from the last validation of the draft. */
  errors: DashboardFinding[] = [];
  warnings: DashboardFinding[] = [];
  warningFingerprint = '';
  acknowledgedWarnings = new Set<string>();
  staleConflict = false;

  copyFrom = {
    open: false,
    sourceKey: '',
    selection: emptySelection(),
    loading: false,
    candidate: null as DashboardSettings | null,
    changes: [] as DashboardGroupChange[],
    errors: [] as DashboardFinding[],
    warnings: [] as DashboardFinding[],
    error: ''
  };

  copyTo = {
    open: false,
    destinations: new Set<string>(),
    selection: emptySelection(),
    filter: '',
    loading: false,
    preview: null as DashboardCopyPreview | null,
    acknowledged: new Set<string>(),
    error: ''
  };

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(DashboardConfigApiService) private api: DashboardConfigApiService
  ) {
    super();
    this.initDependencies = [this.translationService, this.api];
  }

  protected override async initComponent(): Promise<void> {
    this.brandingAndPortalUrl = this.api.brandingAndPortalUrl;
    await this.reloadTargets();
    await this.selectFromHash();
  }

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------

  private async reloadTargets(): Promise<void> {
    this.targetsLoading = true;
    this.targetsError = '';
    try {
      this.targets = (await this.api.getTargets()).targets;
      this.recordTypes = Array.from(new Set(this.targets.filter((t) => t.target.kind === 'workflow').map((t) => t.recordType))).sort();
    } catch (e) {
      this.targetsError = this.describeError(e, this.translationService.t('admin-dashboard-targets-error'));
      this.logger.error('Failed to load dashboard targets', e);
    } finally {
      this.targetsLoading = false;
    }
  }

  async retry(): Promise<void> {
    if (this.targetsError) {
      await this.reloadTargets();
      await this.selectFromHash();
    } else {
      await this.loadSelected();
    }
  }

  targetHash(info: DashboardTargetInfo): string {
    // A fragment-only URL resolves against the portal's <base href="/">.
    // Keep the editor path for history updates and links opened in a new tab.
    return window.location.pathname + window.location.search + '#target=' + encodeURIComponent(info.key);
  }

  @HostListener('window:hashchange')
  async selectFromHash(): Promise<void> {
    const key = new URLSearchParams(window.location.hash.slice(1)).get('target');
    const target = key ? this.targets.find((info) => info.key === key) : this.targets[0];
    if (target) await this.selectTarget(target);
  }

  private filteredTargets(kind: 'workflow' | 'view'): DashboardTargetInfo[] {
    const term = this.navFilter.trim().toLowerCase();
    return this.targets.filter((info) => {
      if (info.target.kind !== kind) return false;
      const owner = info.target.kind === 'workflow' ? info.target.recordType : info.target.view;
      return !term || [owner, info.ownerLabel, info.stepLabel, this.targetLabel(info), this.stepName(info)].some((v) => v.toLowerCase().includes(term));
    });
  }

  get workflowTargets(): DashboardTargetInfo[] { return this.filteredTargets('workflow'); }
  get viewTargets(): DashboardTargetInfo[] { return this.filteredTargets('view'); }
  trackTarget(index: number, info: DashboardTargetInfo): string { return info.key; }

  stepName(info: DashboardTargetInfo): string {
    return info.target.kind === 'workflow' ? info.target.stage : info.target.step;
  }

  targetId(info: DashboardTargetInfo): string {
    return info.target.kind === 'workflow' ? info.target.recordType : info.target.view;
  }

  private humanizeTarget(value: string): string {
    const words = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  targetLabel(info: DashboardTargetInfo | null | undefined): string {
    if (!info) {
      return '';
    }
    const nameKey = `${info.ownerLabel}-name`;
    const name = this.translationService.t(nameKey);
    const ownerTranslation = this.translationService.t(info.ownerLabel);
    const owner = info.target.kind === 'workflow' && name !== nameKey ? name
      : ownerTranslation !== info.ownerLabel ? ownerTranslation : this.humanizeTarget(this.targetId(info));
    const stepKey = info.stepLabel || this.stepName(info);
    const translatedStep = this.translationService.t(stepKey);
    const step = translatedStep !== stepKey ? translatedStep : this.humanizeTarget(this.stepName(info));
    return owner === step ? owner : `${owner} · ${step}`;
  }

  get selectedLocation(): string {
    if (!this.selected) return '';
    const target = this.selected.target;
    return target.kind === 'workflow'
      ? '/dashboard/' + encodeURIComponent(target.recordType) + '?stage=' + encodeURIComponent(target.stage)
      : '/dashboard-view/' + encodeURIComponent(target.view);
  }

  isSelected(info: DashboardTargetInfo): boolean {
    return this.selected?.key === info.key;
  }

  get isDirty(): boolean {
    return !!this.draft && JSON.stringify(this.draft) !== this.savedJson;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isDirty && !this.allowLeave) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private confirmDiscard(action: string): boolean {
    return !this.isDirty || window.confirm(this.translationService.t('admin-dashboard-discard-confirm'));
  }

  @HostListener('document:click', ['$event'])
  confirmNavigation(event: MouseEvent): void {
    if (!this.isDirty || this.allowLeave || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.getAttribute('href')?.startsWith('#')) return;
    event.preventDefault();
    this.dialogTrigger = document.activeElement as HTMLElement;
    this.pendingLeave = anchor.href;
  }

  cancelLeave(): void { this.pendingLeave = ''; this.dialogTrigger?.focus(); }
  leavePage(): void { this.allowLeave = true; window.location.assign(this.pendingLeave); }

  discard(): void {
    if (!this.saving && this.draft && this.savedJson) {
      this.draft = JSON.parse(this.savedJson);
      this.clearFindings();
      this.error = '';
      this.message = '';
    }
  }

  async selectTarget(info: DashboardTargetInfo, force = false, userInitiated = false): Promise<void> {
    if (this.saving && !force) return;
    if (!force && (this.isSelected(info) || !this.confirmDiscard('open another dashboard'))) {
      if (this.selected) window.history.replaceState(null, '', this.targetHash(this.selected));
      return;
    }
    this.closeDialogs();
    this.selected = info;
    window.history.replaceState(null, '', this.targetHash(info));
    this.focusEditor = userInitiated && window.matchMedia('(max-width: 991.98px)').matches;
    await this.loadSelected();
  }

  private async loadSelected(): Promise<void> {
    if (!this.selected) {
      return;
    }
    const info = this.selected;
    const generation = ++this.loadGeneration;
    this.loading = true;
    this.loadFailed = false;
    this.draft = null;
    this.savedJson = '';
    this.baseRevision = 0;
    this.error = '';
    this.message = '';
    this.clearFindings();
    this.staleConflict = false;
    this.loadFieldCatalogue(info, generation);
    try {
      const result = await this.api.getSettings(info.target);
      if (this.selected?.key !== info.key || this.loadGeneration !== generation) {
        return;
      }
      this.draft = cloneSettings(result.settings);
      this.savedJson = JSON.stringify(this.draft);
      this.baseRevision = result.revision;
      this.columnCounts.set(info.key, this.draft.tableConfig.rowConfig.length);
    } catch (e) {
      if (this.selected?.key !== info.key || this.loadGeneration !== generation) {
        return;
      }
      this.draft = null;
      this.loadFailed = true;
      this.error = this.describeError(e, 'Failed to load dashboard settings.');
      this.logger.error('Failed to load dashboard settings', e);
    } finally {
      if (this.selected?.key === info.key && this.loadGeneration === generation) {
        this.loading = false;
      }
    }
  }

  /** Field suggestions are an aid; failures never block editing. */
  private async loadFieldCatalogue(info: DashboardTargetInfo, generation: number): Promise<void> {
    this.fieldCatalogue = null;
    try {
      const catalogue = await this.api.getFields(info.target);
      if (this.selected?.key === info.key && this.loadGeneration === generation) {
        this.fieldCatalogue = catalogue;
      }
    } catch (e) {
      this.logger.warn('Could not load record fields for the dashboard', e);
    }
  }

  async reloadDiscardingDraft(): Promise<void> {
    if (this.confirmDiscard('reload the saved settings')) {
      await this.loadSelected();
    }
  }

  onTableConfigChange(config: DashboardTableConfig): void {
    if (this.draft) {
      this.draft.tableConfig = config as DashboardSettings['tableConfig'];
      this.clearFindings();
    }
  }

  onDraftChanged(): void {
    this.clearFindings();
  }

  // ---------------------------------------------------------------------
  // Validation and save
  // ---------------------------------------------------------------------

  private clearFindings(): void {
    this.errors = [];
    this.warnings = [];
    this.warningFingerprint = '';
    this.acknowledgedWarnings = new Set();
  }

  toggleWarning(finding: DashboardFinding, set: Set<string>): void {
    if (set.has(finding.id)) {
      set.delete(finding.id);
    } else {
      set.add(finding.id);
    }
  }

  get allWarningsAcknowledged(): boolean {
    return this.warnings.every((w) => this.acknowledgedWarnings.has(w.id));
  }

  async save(): Promise<void> {
    if (this.loading || this.saving || !this.selected || !this.draft) {
      return;
    }
    const info = this.selected;
    const generation = this.loadGeneration;
    const candidate = cloneSettings(this.draft);
    const candidateJson = JSON.stringify(candidate);
    const expectedRevision = this.baseRevision;
    this.saving = true;
    this.message = '';
    this.error = '';
    try {
      const reviewedWarnings = this.warnings.length > 0 && this.allWarningsAcknowledged ? this.warningFingerprint : '';
      const validation = await this.api.validate(info.target, expectedRevision, candidate);
      if (this.selected?.key !== info.key || this.loadGeneration !== generation) {
        return;
      }
      if (JSON.stringify(this.draft) !== candidateJson) {
        this.error = 'The draft changed while validation was running. Save it again.';
        return;
      }
      this.errors = validation.errors;
      if (validation.errors.length) {
        this.warnings = validation.warnings;
        this.error = 'Fix the errors below before saving.';
        return;
      }
      if (validation.warnings.length && reviewedWarnings !== validation.validationFingerprint) {
        this.warnings = validation.warnings;
        this.warningFingerprint = validation.validationFingerprint;
        this.acknowledgedWarnings = new Set();
        this.error = 'Review and acknowledge each warning, then save again.';
        return;
      }
      const saved = await this.api.save(info.target, {
        expectedRevision,
        settings: candidate,
        validationFingerprint: validation.validationFingerprint,
        acknowledgedWarningIds: validation.warnings.map((w) => w.id)
      });
      if (this.selected?.key !== info.key || this.loadGeneration !== generation) {
        return;
      }
      this.savedJson = JSON.stringify(saved.settings);
      if (JSON.stringify(this.draft) === candidateJson) {
        this.draft = cloneSettings(saved.settings);
      }
      this.baseRevision = saved.revision;
      this.columnCounts.set(info.key, saved.settings.tableConfig.rowConfig.length);
      this.clearFindings();
      this.message = `Saved ${this.targetLabel(info)}.`;
    } catch (e) {
      if (this.selected?.key === info.key && this.loadGeneration === generation) {
        this.handleWriteError(e, 'Failed to save dashboard settings.');
      }
    } finally {
      this.saving = false;
    }
  }

  private handleWriteError(e: unknown, fallback: string): void {
    if (e instanceof DashboardConfigApiError) {
      if (e.code === 'stale-revision') {
        this.staleConflict = true;
      }
      if (Array.isArray(e.details['errors'])) {
        this.errors = e.details['errors'];
      }
      if (Array.isArray(e.details['warnings'])) {
        this.warnings = e.details['warnings'];
        this.warningFingerprint = e.details['validationFingerprint'] ?? '';
      }
    }
    this.error = this.describeError(e, fallback);
    this.logger.error(fallback, e);
  }

  private describeError(e: unknown, fallback: string): string {
    return e instanceof Error && e.message ? e.message : fallback;
  }

  // ---------------------------------------------------------------------
  // Copy from (draft only)
  // ---------------------------------------------------------------------

  get copySources(): DashboardTargetInfo[] {
    return this.targets.filter((t) => t.key !== this.selected?.key);
  }

  private selectedCopyGroups(selection: SelectionState): DashboardCopySelection[] {
    return (Object.keys(selection) as DashboardCopySelection[]).filter((k) => selection[k]);
  }

  onSelectAll(selection: SelectionState): void {
    for (const group of COPY_GROUPS) {
      selection[group.id] = selection.all;
    }
  }

  onSelectGroup(selection: SelectionState): void {
    selection.all = COPY_GROUPS.every((g) => selection[g.id]);
  }

  openCopyFrom(): void {
    if (this.copyTo.loading) return;
    const trigger = this.copyFrom.open || this.copyTo.open ? this.dialogTrigger : document.activeElement as HTMLElement;
    this.closeDialogs();
    this.dialogTrigger = trigger;
    this.copyFrom = { ...this.copyFrom, open: true, sourceKey: '', selection: emptySelection(), candidate: null, changes: [], errors: [], warnings: [], error: '' };
    this.resetCopyFromPreview();
  }

  resetCopyFromPreview(): void {
    this.copyFromGeneration++;
    this.copyFrom.loading = false;
    this.copyFrom.candidate = null;
    this.copyFrom.changes = [];
    this.copyFrom.errors = [];
    this.copyFrom.warnings = [];
    this.copyFrom.error = '';
  }

  /** Load the saved source and show what the selected groups would replace in the draft. */
  async previewCopyFrom(): Promise<void> {
    const source = this.targets.find((t) => t.key === this.copyFrom.sourceKey);
    const selection = this.selectedCopyGroups(this.copyFrom.selection);
    if (!source || !this.draft || !this.selected || selection.length === 0) {
      this.copyFrom.error = 'Choose a saved source and at least one group of settings.';
      return;
    }
    this.resetCopyFromPreview();
    const generation = this.copyFromGeneration;
    const destination = this.selected;
    const draft = this.draft;
    const revision = this.baseRevision;
    this.copyFrom.loading = true;
    try {
      const saved = await this.api.getSettings(source.target);
      if (this.copyFromGeneration !== generation || !this.copyFrom.open || this.selected !== destination || this.draft !== draft) {
        return;
      }
      const groups = selectionToGroups(selection);
      const candidate = applyCopyGroups(saved.settings, draft, groups);
      // Validate against the destination's base revision; the source revision never advances it.
      const validation = await this.api.validate(destination.target, revision, candidate);
      if (this.copyFromGeneration !== generation || !this.copyFrom.open || this.selected !== destination || this.draft !== draft) {
        return;
      }
      this.copyFrom.candidate = candidate;
      this.copyFrom.changes = describeGroupChanges(draft, candidate, groups);
      this.copyFrom.errors = validation.errors;
      this.copyFrom.warnings = validation.warnings;
    } catch (e) {
      if (this.copyFromGeneration === generation) {
        this.copyFrom.error = this.describeError(e, 'Could not load the source settings.');
      }
    } finally {
      if (this.copyFromGeneration === generation) {
        this.copyFrom.loading = false;
      }
    }
  }

  applyCopyFrom(): void {
    if (!this.copyFrom.candidate) {
      return;
    }
    this.draft = this.copyFrom.candidate;
    this.clearFindings();
    const source = this.targets.find((t) => t.key === this.copyFrom.sourceKey);
    this.message = `Loaded ${this.copyFrom.changes.map((c) => c.label.toLowerCase()).join(', ')} from ${this.targetLabel(source)} into the draft. Review and save to keep the changes.`;
    this.copyFrom.open = false;
  }

  // ---------------------------------------------------------------------
  // Copy to (bulk, saved source only)
  // ---------------------------------------------------------------------

  get copyDestinations(): DashboardTargetInfo[] {
    const term = this.copyTo.filter.trim().toLowerCase();
    return this.copySources.filter((t) => !term || this.targetLabel(t).toLowerCase().includes(term));
  }

  openCopyTo(): void {
    if (this.copyTo.loading) return;
    if (this.isDirty) {
      this.error = 'Save or discard your changes first. Copy to only copies saved settings.';
      return;
    }
    const trigger = this.copyFrom.open || this.copyTo.open ? this.dialogTrigger : document.activeElement as HTMLElement;
    this.closeDialogs();
    this.dialogTrigger = trigger;
    this.copyTo = { ...this.copyTo, open: true, destinations: new Set(), selection: emptySelection(), filter: '', preview: null, acknowledged: new Set(), error: '' };
  }

  toggleDestination(info: DashboardTargetInfo): void {
    if (this.copyTo.destinations.has(info.key)) {
      this.copyTo.destinations.delete(info.key);
    } else {
      this.copyTo.destinations.add(info.key);
    }
    this.copyTo.preview = null;
  }

  async previewCopyTo(): Promise<void> {
    const selection = this.selectedCopyGroups(this.copyTo.selection);
    const destinations = this.targets.filter((t) => this.copyTo.destinations.has(t.key)).map((t) => t.target);
    if (!this.selected || destinations.length === 0 || selection.length === 0) {
      this.copyTo.error = 'Choose at least one destination and one group of settings.';
      return;
    }
    this.copyTo.loading = true;
    this.copyTo.error = '';
    this.copyTo.preview = null;
    this.copyTo.acknowledged = new Set();
    try {
      this.copyTo.preview = await this.api.previewCopy(this.selected.target, destinations, selection.includes('all') ? ['all'] : selection);
    } catch (e) {
      this.copyTo.error = this.describeError(e, 'Could not preview the copy.');
    } finally {
      this.copyTo.loading = false;
    }
  }

  get canApplyCopyTo(): boolean {
    const preview = this.copyTo.preview;
    return !!preview && preview.errors.length === 0 && preview.warnings.every((w) => this.copyTo.acknowledged.has(w.id)) && !this.copyTo.loading;
  }

  async applyCopyTo(): Promise<void> {
    const preview = this.copyTo.preview;
    if (!preview || !this.canApplyCopyTo || !this.selected) {
      return;
    }
    const selected = this.selected;
    this.copyTo.loading = true;
    this.copyTo.error = '';
    try {
      const result = await this.api.applyCopy(preview, Array.from(this.copyTo.acknowledged));
      this.copyTo.open = false;
      if (this.selected?.key === selected.key) {
        if (preview.expectedRevision === this.baseRevision) {
          // The source is not a destination, so its settings remain current.
          this.baseRevision = result.revision;
        } else {
          // The source may have changed before preview; retain the draft and
          // its old revision so a later save cannot overwrite that change.
          this.staleConflict = true;
          this.error = 'Dashboard settings changed since this draft loaded. Reload saved settings before saving.';
        }
      }
      this.message = `Copied settings to ${result.updated} dashboard${result.updated === 1 ? '' : 's'}.`;
    } catch (e) {
      this.copyTo.error = this.describeError(e, 'Could not apply the copy. Nothing was changed.');
      if (e instanceof DashboardConfigApiError && (e.code === 'stale-preview' || e.code === 'stale-revision')) {
        this.copyTo.preview = null;
      }
    } finally {
      this.copyTo.loading = false;
    }
  }

  findingTargetLabel(finding: DashboardFinding): string {
    const info = this.targets.find((t) => JSON.stringify(t.target) === JSON.stringify(finding.target));
    return info ? this.targetLabel(info) : '';
  }

  closeDialogs(): void {
    if (this.copyTo.loading) return;
    this.copyFromGeneration++;
    this.copyFrom.open = false;
    this.copyTo.open = false;
    this.copyConfirmation = null;
    this.dialogTrigger?.focus();
  }

  async confirmCopy(): Promise<void> {
    const mode = this.copyConfirmation;
    this.copyConfirmation = null;
    if (mode === 'from') this.applyCopyFrom();
    if (mode === 'to') await this.applyCopyTo();
    if (!this.copyFrom.open && !this.copyTo.open) this.dialogTrigger?.focus();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }
}
