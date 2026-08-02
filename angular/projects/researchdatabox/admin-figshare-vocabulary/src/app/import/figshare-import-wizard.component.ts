import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  FigshareLocalVocabulary,
  FigshareScope,
  FigshareTaxonomySummary
} from '../services/figshare-vocabulary-api.service';

export interface FigshareImportRequest {
  scope: FigshareScope;
  taxonomyId: string;
  localVocabularyId?: string;
  createLocalClone: boolean;
  localCloneName?: string;
  localCloneSlug?: string;
}

/**
 * Step state: scope → taxonomy → local target → preview.
 *
 * Step inputs are preserved when navigating back and the component never holds a
 * Figshare token: only the chosen scope is submitted.
 */
@Component({
  selector: 'figshare-import-wizard',
  templateUrl: './figshare-import-wizard.component.html',
  standalone: false
})
export class FigshareImportWizardComponent {
  @Input() taxonomies: FigshareTaxonomySummary[] = [];
  @Input() localVocabularies: FigshareLocalVocabulary[] = [];
  @Input() discovering = false;
  @Input() generating = false;
  @Input() errorMessage = '';

  @Output() discoverRequested = new EventEmitter<FigshareScope>();
  @Output() previewRequested = new EventEmitter<FigshareImportRequest>();
  @Output() cancelled = new EventEmitter<void>();

  public step: 1 | 2 | 3 = 1;
  public scope: FigshareScope = 'public';
  public taxonomyId = '';
  public targetMode: 'existing' | 'clone' = 'existing';
  public localVocabularyId = '';
  public cloneName = '';
  public cloneSlug = '';

  get selectedTaxonomy(): FigshareTaxonomySummary | undefined {
    return this.taxonomies.find((taxonomy) => taxonomy.taxonomyId === this.taxonomyId);
  }

  get canDiscover(): boolean {
    return !this.discovering;
  }

  get canAdvanceToTarget(): boolean {
    return this.taxonomyId !== '' && this.selectedTaxonomy !== undefined;
  }

  get canGeneratePreview(): boolean {
    if (this.generating) {
      return false;
    }
    if (this.targetMode === 'clone') {
      return this.cloneName.trim() !== '';
    }
    return this.localVocabularyId !== '';
  }

  discover(): void {
    this.taxonomyId = '';
    this.step = 2;
    this.discoverRequested.emit(this.scope);
  }

  selectTaxonomy(taxonomyId: string): void {
    this.taxonomyId = taxonomyId;
  }

  goToTarget(): void {
    if (this.canAdvanceToTarget) {
      this.step = 3;
    }
  }

  back(): void {
    // Inputs are intentionally retained so a reviewer can revise one step at a time.
    this.step = this.step === 3 ? 2 : 1;
  }

  generatePreview(): void {
    if (!this.canGeneratePreview) {
      return;
    }
    this.previewRequested.emit({
      scope: this.scope,
      taxonomyId: this.taxonomyId,
      createLocalClone: this.targetMode === 'clone',
      localVocabularyId: this.targetMode === 'existing' ? this.localVocabularyId : undefined,
      localCloneName: this.targetMode === 'clone' ? this.cloneName.trim() : undefined,
      localCloneSlug: this.targetMode === 'clone' && this.cloneSlug.trim() ? this.cloneSlug.trim() : undefined
    });
  }
}
