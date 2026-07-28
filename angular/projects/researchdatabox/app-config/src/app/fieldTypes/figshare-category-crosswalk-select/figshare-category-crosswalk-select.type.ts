import { Component, Inject, OnInit } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import {
  FigshareCrosswalkApiService,
  FigshareCrosswalkOption
} from '../../services/figshare-crosswalk-api.service';

/**
 * Selects the approved Figshare crosswalk used by publishing.
 *
 * Only approved, same-brand crosswalks whose local side matches the selected source
 * vocabulary are offered. Selecting or clearing a crosswalk never mutates the legacy
 * mapping table, which stays visible and labelled inactive.
 */
@Component({
  selector: 'formly-figshare-category-crosswalk-select-type',
  templateUrl: './figshare-category-crosswalk-select.type.html',
  standalone: false
})
export class FigshareCrosswalkSelectTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  public crosswalks: FigshareCrosswalkOption[] = [];
  public loading = true;
  public loadError = '';
  public adminUrl = '';

  constructor(@Inject(FigshareCrosswalkApiService) private api: FigshareCrosswalkApiService) {
    super();
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.api.waitForInit();
      this.adminUrl = this.api.getCrosswalkAdminUrl();
      this.crosswalks = await this.api.listApprovedCrosswalks();
    } catch (_err) {
      this.loadError = 'Unable to load approved Figshare crosswalks.';
    } finally {
      this.loading = false;
    }
  }

  get sourceVocabularyId(): string {
    return String((this.model as Record<string, unknown> | undefined)?.['sourceVocabularyId'] ?? '');
  }

  get crosswalkModeActive(): boolean {
    return (this.model as Record<string, unknown> | undefined)?.['resolutionMode'] === 'crosswalk';
  }

  /** Filter to the crosswalks whose local side matches the selected source vocabulary. */
  get crosswalkOptions(): FigshareCrosswalkOption[] {
    const vocabularyId = this.sourceVocabularyId;
    if (!vocabularyId) {
      return this.crosswalks;
    }
    return this.crosswalks.filter((crosswalk) => crosswalk.localVocabularyId === vocabularyId);
  }

  get selectedId(): string {
    return String(this.formControl?.value ?? '');
  }

  get selected(): FigshareCrosswalkOption | undefined {
    return this.crosswalks.find((crosswalk) => crosswalk.id === this.selectedId);
  }

  get validationMessage(): string {
    if (!this.crosswalkModeActive) {
      return '';
    }
    if (!this.sourceVocabularyId) {
      return 'Select both a source vocabulary and an approved crosswalk, or switch to the legacy mapping table.';
    }
    if (!this.selectedId) {
      return 'Select an approved crosswalk, or switch to the legacy mapping table.';
    }
    if (!this.selected) {
      return 'The selected crosswalk is not available for this brand.';
    }
    if (this.selected.localVocabularyId !== this.sourceVocabularyId) {
      return 'The crosswalk maps a different local vocabulary.';
    }
    if (this.selected.approvedRevision == null) {
      return 'Approve a mapping revision before selecting this crosswalk.';
    }
    return '';
  }

  onSelect(value: string): void {
    this.formControl?.setValue(value);
    this.formControl?.markAsDirty();
  }
}
