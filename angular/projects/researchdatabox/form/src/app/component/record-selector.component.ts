import { Component, DestroyRef, ElementRef, Injector, Input, QueryList, ViewChildren, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel, RecordService } from '@researchdatabox/portal-ng-common';
import {
  RecordSelectorComponentName,
  RecordSelectorFieldComponentConfig,
  RecordSelectorModelName,
  RecordSelectorModelValueType,
} from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../form.component';
import {FormService} from "../form.service";

interface SelectableRecord {
  oid: string;
  title: string;
}

export class RecordSelectorModel extends FormFieldModel<RecordSelectorModelValueType> {
  protected override logName = RecordSelectorModelName;
}

@Component({
  selector: 'redbox-record-selector',
  templateUrl: './record-selector.component.html',
  styles: [
    `
      .rb-record-selector {
        padding: 0;
      }

      .rb-record-selector-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        align-items: flex-start;
      }

      .rb-record-selector-search {
        flex: 1 1 16rem;
      }

      .rb-record-selector-search-panel {
        border: 1px solid #d6dde6;
        border-radius: 0.85rem;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        padding: 1rem;
        margin-bottom: 0.85rem;
      }

      .rb-record-selector-search-input-wrap {
        position: relative;
      }

      .rb-record-selector-search-hint {
        margin: 0.45rem 0 0;
        color: #5f6b78;
        font-size: 0.88rem;
      }

      .rb-record-selector-toolbar.is-selected {
        justify-content: flex-start;
        align-items: center;
      }

      .rb-record-selector-actions {
        display: flex;
        gap: 0.5rem;
        padding-top: 2rem;
      }

      .rb-record-selector-toolbar.is-selected .rb-record-selector-actions {
        padding-top: 0;
      }

      .rb-record-selector-reset-btn {
        padding: 6px 12px;
      }

      .rb-record-selector-selected-title {
        font-size: 1rem;
        line-height: 1.5;
        color: #1c2733;
        overflow-wrap: anywhere;
      }

      .rb-record-selector-results {
        display: grid;
        gap: 0.45rem;
      }

      .rb-record-selector-results-shell {
        border: 1px solid #d6dde6;
        border-radius: 0.85rem;
        overflow: hidden;
        background: #fff;
      }

      .rb-record-selector-results-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.9rem 1rem;
        border-bottom: 1px solid #e1e7ef;
        background: #f8fafc;
      }

      .rb-record-selector-results-kicker {
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #0f5a8a;
        margin-bottom: 0.15rem;
      }

      .rb-record-selector-results-copy {
        color: #5f6b78;
        font-size: 0.92rem;
      }

      .rb-record-selector-option {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.9rem;
        text-align: left;
        border: 0;
        border-bottom: 1px solid #e1e7ef;
        background: #fff;
        padding: 0.9rem 1rem;
        transition:
          background-color 140ms ease,
          box-shadow 140ms ease,
          border-color 140ms ease;
      }

      .rb-record-selector-option:last-child {
        border-bottom: 0;
      }

      .rb-record-selector-option:hover {
        background: #f7fbff;
      }

      .rb-record-selector-option.is-selected {
        box-shadow: inset 4px 0 0 #0f5a8a;
        background: #eef7fd;
      }

      .rb-record-selector-option:focus-visible {
        outline: 2px solid #0f5a8a;
        outline-offset: 2px;
      }

      .rb-record-selector-option-main {
        min-width: 0;
        display: grid;
        gap: 0.18rem;
      }

      .rb-record-selector-title {
        font-weight: 600;
        color: #1c2733;
        overflow-wrap: anywhere;
      }

      .rb-record-selector-meta {
        display: block;
        color: #5f6b78;
        font-size: 0.85rem;
      }

      .rb-record-selector-option-affordance {
        flex: 0 0 auto;
        color: #0f5a8a;
        font-weight: 600;
        font-size: 0.88rem;
      }

      .rb-record-selector-status {
        color: #5f6b78;
        font-size: 0.88rem;
        margin-bottom: 0.85rem;
      }

      .rb-record-selector-status.is-error {
        color: #ab2c2c;
      }

      @media (max-width: 767.98px) {
        .rb-record-selector-actions {
          padding-top: 0;
        }

        .rb-record-selector-option {
          align-items: flex-start;
          flex-direction: column;
        }

        .rb-record-selector-option-affordance {
          padding-top: 0.1rem;
        }
      }
    `,
  ],
  standalone: false,
})
export class RecordSelectorComponent extends FormFieldBaseComponent<RecordSelectorModelValueType> {
  protected override logName = RecordSelectorComponentName;

  private static readonly searchDebounceMs = 250;

  public readonly searchControl = new FormControl<string>('');
  public readonly listboxId = `record-selector-${Math.random().toString(36).slice(2, 10)}`;
  public readonly statusId = `${this.listboxId}-status`;

  public tooltip = '';
  public columnTitle = 'Record title';
  public records: SelectableRecord[] = [];
  public filteredRecords: SelectableRecord[] = [];
  public loading = false;
  public statusMessageKey = 'record-selector-status-idle';
  public errorMessageKey = '';
  public focusedIndex = 0;
  public isChangingSelection = false;

  private recordType = '';
  private workflowState = '';
  private filterMode = 'default';
  private filterFields: string[] = [];
  private latestSearchRequestId = 0;
  private searchSubscriptionInitialised = false;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly recordService = inject(RecordService);
  private readonly formService = inject(FormService);

  @ViewChildren('recordOption') private optionButtons?: QueryList<ElementRef<HTMLButtonElement>>;
  @Input() public override model?: RecordSelectorModel;

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const cfg =
      (this.componentDefinition?.config as RecordSelectorFieldComponentConfig) ?? new RecordSelectorFieldComponentConfig();
    this.tooltip = this.getStringProperty('tooltip');
    this.columnTitle = String(cfg.columnTitle ?? 'Record title');
    this.recordType = String(cfg.recordType ?? '').trim();
    this.workflowState = String(cfg.workflowState ?? '').trim();
    this.filterMode = this.normaliseFilterMode(cfg.filterMode);
    this.filterFields = Array.isArray(cfg.filterFields) ? cfg.filterFields.map((value: unknown) => String(value)) : [];
    if (!this.searchSubscriptionInitialised) {
      this.searchSubscriptionInitialised = true;
      this.searchControl.valueChanges
        .pipe(debounceTime(RecordSelectorComponent.searchDebounceMs), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
        .subscribe(value => {
          void this.onSearchTermChanged(String(value ?? ''));
        });
    }
  }

  protected override async initData(): Promise<void> {
    await this.recordService.waitForInit();
    this.records = [];
    this.filteredRecords = [];
    this.statusMessageKey = 'record-selector-status-idle';
  }

  public get selectedRecord(): RecordSelectorModelValueType {
    return this.model?.getValue() ?? null;
  }

  public get isInteractive(): boolean {
    return !this.isReadonly && !this.isDisabled && this.getFormComponent.editMode();
  }

  public get showSearchUi(): boolean {
    return !this.selectedRecord || this.isChangingSelection;
  }

  public get showStatusMessage(): boolean {
    return this.loading || !!this.errorMessageKey || this.filteredRecords.length === 0;
  }

  public async onSearchInput(event?: Event): Promise<void> {
    const input = event?.target as HTMLInputElement | null;
    const term = String(input?.value ?? '').trim();
    this.searchControl.setValue(term);
  }

  private async onSearchTermChanged(rawValue: string): Promise<void> {
    const term = rawValue.trim();
    const requestId = ++this.latestSearchRequestId;
    if (this.filterMode === 'default') {
      if (!this.records.length && term) {
        await this.loadRecords(term, requestId);
        return;
      }
      this.applyLocalFilter(term);
      return;
    }
    if (!term) {
      this.records = [];
      this.filteredRecords = [];
      this.statusMessageKey = 'record-selector-status-idle';
      this.errorMessageKey = '';
      return;
    }
    await this.loadRecords(term, requestId);
  }

  public async resetFilter(): Promise<void> {
    this.latestSearchRequestId += 1;
    this.searchControl.setValue('', { emitEvent: false });
    this.records = [];
    this.filteredRecords = [];
    this.loading = false;
    this.errorMessageKey = '';
    this.statusMessageKey = 'record-selector-status-idle';
  }

  public selectRecord(record: SelectableRecord): void {
    this.model?.setValue({ oid: record.oid, title: record.title });
    this.formControl.markAsTouched();
    this.isChangingSelection = false;
  }

  public clearSelection(): void {
    this.model?.setValue(null);
    this.formControl.markAsTouched();
    this.isChangingSelection = true;
  }

  public changeSelection(): void {
    this.isChangingSelection = true;
  }

  public async onResultsKeydown(event: KeyboardEvent): Promise<void> {
    if (this.filteredRecords.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.focusOption(Math.min(this.focusedIndex + 1, this.filteredRecords.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusOption(Math.max(this.focusedIndex - 1, 0));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      this.focusOption(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      this.focusOption(this.filteredRecords.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const record = this.filteredRecords[this.focusedIndex];
      if (record) {
        this.selectRecord(record);
      }
    }
  }

  public isSelected(record: SelectableRecord): boolean {
    return this.selectedRecord?.oid === record.oid;
  }

  private async loadRecords(search: string, requestId: number): Promise<void> {
    this.loading = true;
    this.errorMessageKey = '';
    this.statusMessageKey = 'record-selector-status-loading';
    try {
      const response = await this.recordService.getRecords(
        this.recordType,
        this.workflowState,
        1,
        '',
        '',
        this.filterMode === 'default' ? '' : this.filterFields.join(','),
        this.filterMode === 'default' ? '' : search,
        this.filterMode === 'default' ? '' : this.filterMode
      );
      if (requestId !== this.latestSearchRequestId) {
        return;
      }
      this.records = this.extractRecords(response);
      if (this.filterMode === 'default') {
        this.applyLocalFilter(search);
      } else {
        this.filteredRecords = this.records;
        this.statusMessageKey = this.filteredRecords.length === 0 ? 'record-selector-status-none' : 'record-selector-status-results';
      }
      this.syncSelectedTitle();
      this.focusedIndex = 0;
    } catch (error) {
      if (requestId !== this.latestSearchRequestId) {
        return;
      }
      this.loggerService.error(`${this.logName}: unable to load records`, error);
      this.records = [];
      this.filteredRecords = [];
      this.errorMessageKey = 'record-selector-status-error';
      this.statusMessageKey = this.errorMessageKey;
    } finally {
      if (requestId === this.latestSearchRequestId) {
        this.loading = false;
      }
    }
  }

  private applyLocalFilter(search: string): void {
    const term = search.toLowerCase();
    this.filteredRecords = !term
      ? []
      : this.records.filter(record => record.title.toLowerCase().includes(term) || record.oid.toLowerCase().includes(term));
    this.focusedIndex = 0;
    this.statusMessageKey = !term
      ? 'record-selector-status-idle'
      : this.filteredRecords.length === 0
        ? 'record-selector-status-none'
        : 'record-selector-status-results';
  }

  private normaliseFilterMode(value: unknown): string {
    const mode = String(value ?? 'default').trim().toLowerCase();
    if (!mode || mode === 'default') {
      return 'default';
    }
    if (mode === 'equal' || mode === 'exact') {
      return 'equal';
    }
    return 'regex';
  }

  private extractRecords(response: unknown): SelectableRecord[] {
    const root = response as Record<string, unknown>;
    const nestedData = root['data'] as Record<string, unknown> | undefined;
    const list =
      (Array.isArray(root['records']) ? (root['records'] as unknown[]) : undefined) ??
      (Array.isArray(root['items']) ? (root['items'] as unknown[]) : undefined) ??
      (Array.isArray(nestedData?.['records']) ? (nestedData['records'] as unknown[]) : undefined) ??
      [];

    return list
      .map((item) => {
        const record = item as Record<string, unknown>;
        return {
          oid: String(record['oid'] ?? ''),
          title: String(record['title'] ?? record['oid'] ?? ''),
        };
      })
      .filter((record) => Boolean(record.oid));
  }

  private syncSelectedTitle(): void {
    const selected = this.selectedRecord;
    if (!selected?.oid || selected.title) {
      return;
    }
    const match = this.records.find(record => record.oid === selected.oid);
    if (match) {
      this.model?.setValue({ oid: match.oid, title: match.title });
    }
  }

  private focusOption(index: number): void {
    this.focusedIndex = index;
    queueMicrotask(() => {
      this.optionButtons?.get(index)?.nativeElement.focus();
    });
  }

  public get errorMessage(): string {
    return this.translate(this.errorMessageKey);
  }

  private translate(key: string): string {
    return this.formService.translate(key);
  }
}
