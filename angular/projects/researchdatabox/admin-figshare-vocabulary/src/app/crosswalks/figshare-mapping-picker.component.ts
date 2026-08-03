import { Component, DestroyRef, EventEmitter, Inject, Input, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import {
  FigshareCrosswalkLocalEntry,
  FigshareSourceCategory,
  FigshareVocabularyApiService
} from '../services/figshare-vocabulary-api.service';

export interface MappingPickerSelection {
  localEntryId: string;
  localLabel: string;
  figshareCategoryId: string;
  targetLabel: string;
}

/** The local term a target is being added to, when the picker is opened from a row. */
export interface MappingPickerLocalTerm {
  id: string;
  label: string;
  value: string;
}

const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 25;

/**
 * Modal that adds one mapping edge to the working revision. Local terms are searched
 * through the crosswalk so terms with no target yet — which never appear in the mapping
 * table — can be mapped for the first time.
 */
@Component({
  selector: 'figshare-mapping-picker',
  templateUrl: './figshare-mapping-picker.component.html',
  standalone: false
})
export class FigshareMappingPickerComponent implements OnInit {
  @Input() crosswalkId = '';
  @Input() sourceId = '';
  @Input() revision = 1;
  @Input() saving = false;
  /** Set when the picker is opened from a mapping row; the local term is then fixed. */
  @Input() localTerm: MappingPickerLocalTerm | null = null;

  @Output() confirmed = new EventEmitter<MappingPickerSelection>();
  @Output() cancelled = new EventEmitter<void>();

  public readonly localSearchControl = new FormControl('');
  public readonly targetSearchControl = new FormControl('');

  public localEntries: FigshareCrosswalkLocalEntry[] = [];
  public localTotal = 0;
  public localLoading = false;
  public unmappedOnly = false;
  public selectedLocalEntry: FigshareCrosswalkLocalEntry | null = null;

  public categories: FigshareSourceCategory[] = [];
  public categoryTotal = 0;
  public categoriesLoading = false;
  public includeHistorical = false;
  public selectedCategoryId = '';

  /** Targets the chosen local term already has in this revision. */
  public currentTargets: Array<{ id: string; label: string }> = [];
  /** Kept per search: the two lists load in parallel, so one must not clear the other. */
  public localErrorMessage = '';
  public targetErrorMessage = '';

  private readonly destroyRef = inject(DestroyRef);
  private localRequestId = 0;
  private categoryRequestId = 0;
  private currentTargetsRequestId = 0;

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(FigshareVocabularyApiService) private api: FigshareVocabularyApiService
  ) {}

  async ngOnInit(): Promise<void> {
    this.localSearchControl.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadLocalEntries());
    this.targetSearchControl.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadCategories());

    const loads: Array<Promise<void>> = [this.loadCategories()];
    if (this.localTerm) {
      loads.push(this.loadCurrentTargets(this.localTerm.id, this.localTerm.value));
    } else {
      loads.push(this.loadLocalEntries());
    }
    await Promise.all(loads);
  }

  get localTermLabel(): string {
    const term = this.localTerm ?? this.selectedLocalEntry;
    if (!term) {
      return '';
    }
    return term.value && term.value !== term.label ? `${term.value} — ${term.label}` : term.label;
  }

  get resolvedLocalEntryId(): string {
    return this.localTerm?.id ?? this.selectedLocalEntry?.id ?? '';
  }

  get canConfirm(): boolean {
    return !this.saving && !!this.resolvedLocalEntryId && !!this.selectedCategoryId;
  }

  /** True once the target already maps to the chosen local term, so adding is a no-op. */
  isAlreadyMapped(category: FigshareSourceCategory): boolean {
    return this.currentTargets.some((target) => target.id === category.id);
  }

  async toggleUnmappedOnly(unmappedOnly: boolean): Promise<void> {
    this.unmappedOnly = unmappedOnly;
    await this.loadLocalEntries();
  }

  async toggleIncludeHistorical(includeHistorical: boolean): Promise<void> {
    this.includeHistorical = includeHistorical;
    this.selectedCategoryId = '';
    await this.loadCategories();
  }

  async selectLocalEntry(entry: FigshareCrosswalkLocalEntry): Promise<void> {
    this.selectedLocalEntry = entry;
    this.selectedCategoryId = '';
    await this.loadCurrentTargets(entry.id, entry.value);
  }

  clearLocalEntry(): void {
    this.selectedLocalEntry = null;
    this.selectedCategoryId = '';
    this.currentTargetsRequestId++;
    this.currentTargets = [];
  }

  selectCategory(category: FigshareSourceCategory): void {
    this.selectedCategoryId = this.categories.some((row) => row.id === category.id) ? category.id : '';
  }

  confirm(): void {
    const localEntryId = this.resolvedLocalEntryId;
    const category = this.categories.find((row) => row.id === this.selectedCategoryId);
    if (!localEntryId || !category) {
      return;
    }
    this.confirmed.emit({
      localEntryId,
      localLabel: this.localTermLabel,
      figshareCategoryId: category.id,
      targetLabel: `${category.sourceId} (${category.categoryId})`
    });
  }

  private async loadLocalEntries(): Promise<void> {
    if (!this.crosswalkId) {
      return;
    }
    const requestId = ++this.localRequestId;
    this.localLoading = true;
    try {
      const result = await this.api.listCrosswalkLocalEntries(this.crosswalkId, {
        q: String(this.localSearchControl.value ?? '').trim() || undefined,
        mapped: this.unmappedOnly ? 'unmapped' : undefined,
        revision: this.revision,
        limit: PAGE_SIZE
      });
      if (requestId !== this.localRequestId) {
        return;
      }
      this.localEntries = result.records;
      this.localTotal = result.total;
      this.localErrorMessage = '';
    } catch (err) {
      this.logger.error('Failed to load crosswalk local entries', err);
      this.localErrorMessage = this.t('figshare-vocab-error-load-local-entries', 'The local terms could not be loaded.');
    } finally {
      if (requestId === this.localRequestId) {
        this.localLoading = false;
      }
    }
  }

  private async loadCategories(): Promise<void> {
    if (!this.sourceId) {
      return;
    }
    const requestId = ++this.categoryRequestId;
    this.categoriesLoading = true;
    try {
      const result = await this.api.listSourceCategories(this.sourceId, {
        q: String(this.targetSearchControl.value ?? '').trim() || undefined,
        includeHistorical: this.includeHistorical,
        limit: PAGE_SIZE
      });
      if (requestId !== this.categoryRequestId) {
        return;
      }
      this.categories = result.records;
      this.categoryTotal = result.total;
      this.targetErrorMessage = '';
    } catch (err) {
      this.logger.error('Failed to load Figshare categories', err);
      this.targetErrorMessage = this.t('figshare-vocab-error-load-categories', 'The Figshare categories could not be loaded.');
    } finally {
      if (requestId === this.categoryRequestId) {
        this.categoriesLoading = false;
      }
    }
  }

  /**
   * The mapping search matches labels and values across terms, so the page is filtered
   * back down to the chosen term before it is shown as its current targets.
   */
  private async loadCurrentTargets(localEntryId: string, localValue: string): Promise<void> {
    if (!this.crosswalkId) {
      return;
    }
    const requestId = ++this.currentTargetsRequestId;
    try {
      const result = await this.api.listMappings(this.crosswalkId, {
        q: localValue || undefined,
        revision: this.revision,
        limit: 200
      });
      if (requestId !== this.currentTargetsRequestId) return;
      this.currentTargets = result.records
        .filter((mapping) => mapping.localEntryId === localEntryId)
        .map((mapping) => ({
          id: mapping.figshareCategoryId,
          label: mapping.figshareCategoryNumber == null
            ? mapping.figshareSourceId
            : `${mapping.figshareSourceId} (${mapping.figshareCategoryNumber})`
        }));
    } catch (err) {
      this.logger.error('Failed to load the current targets of a local term', err);
      if (requestId === this.currentTargetsRequestId) this.currentTargets = [];
    }
  }

  private t(key: string, defaultValue: string): string {
    return String(this.translationService.t(key, defaultValue));
  }
}
