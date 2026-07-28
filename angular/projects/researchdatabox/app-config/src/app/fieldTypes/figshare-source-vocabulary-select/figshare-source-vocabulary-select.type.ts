import { Component, Inject, OnInit } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import {
  FigshareCrosswalkApiService,
  FigshareLocalVocabularyOption
} from '../../services/figshare-crosswalk-api.service';

/**
 * Selects the local vocabulary that record category codes are resolved against.
 * Only meaningful in crosswalk resolution mode; the stored value is preserved but
 * marked inactive in legacy mapping-table mode.
 */
@Component({
  selector: 'formly-figshare-source-vocabulary-select-type',
  templateUrl: './figshare-source-vocabulary-select.type.html',
  standalone: false
})
export class FigshareSourceVocabularySelectTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  public vocabularies: FigshareLocalVocabularyOption[] = [];
  public loading = true;
  public loadError = '';

  constructor(@Inject(FigshareCrosswalkApiService) private api: FigshareCrosswalkApiService) {
    super();
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.api.waitForInit();
      this.vocabularies = await this.api.listLocalVocabularies();
    } catch (_err) {
      this.loadError = 'Unable to load local vocabularies.';
    } finally {
      this.loading = false;
    }
  }

  get selectedId(): string {
    return String(this.formControl?.value ?? '');
  }

  get crosswalkModeActive(): boolean {
    return (this.model as Record<string, unknown> | undefined)?.['resolutionMode'] === 'crosswalk';
  }

  onSelect(value: string): void {
    this.formControl?.setValue(value);
    this.formControl?.markAsDirty();
    // Clearing the vocabulary invalidates any crosswalk selected against it.
    const model = this.model as Record<string, unknown> | undefined;
    if (model && model['crosswalkId'] && value === '') {
      model['crosswalkId'] = '';
    }
  }
}
