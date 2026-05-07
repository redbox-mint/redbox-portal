import { Component, OnInit } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

type BindingKind = 'path' | 'handlebars' | 'jsonata';
interface ValueBindingValue {
  kind?: BindingKind;
  path?: string;
  template?: string;
  expression?: string;
  defaultValue?: string;
}

const HUMAN_LABELS: Record<string, string> = {
  doi: 'DOI',
  url: 'URL',
  contentUrl: 'Content URL',
  publicationYear: 'Publication Year',
  publisher: 'Publisher',
  prefix: 'Prefix',
  language: 'Language',
  version: 'Version',
  formats: 'Formats',
  sizes: 'Sizes',
  name: 'Name',
  nameType: 'Name Type',
  givenName: 'Given Name',
  familyName: 'Family Name',
  nameIdentifier: 'Name Identifier',
  nameIdentifierScheme: 'Name ID Scheme',
  schemeUri: 'Scheme URI',
  affiliationIdentifier: 'Affiliation ID',
  affiliationIdentifierScheme: 'Affiliation ID Scheme',
  title: 'Title',
  titleType: 'Title Type',
  lang: 'Language',
  subject: 'Subject',
  subjectScheme: 'Subject Scheme',
  valueUri: 'Value URI',
  classificationCode: 'Classification Code',
  date: 'Date',
  dateType: 'Date Type',
  dateInformation: 'Date Information',
  identifier: 'Identifier',
  identifierType: 'Identifier Type',
  relatedIdentifier: 'Related Identifier',
  relatedIdentifierType: 'Related ID Type',
  relationType: 'Relation Type',
  relatedMetadataScheme: 'Related Metadata Scheme',
  schemeType: 'Scheme Type',
  resourceTypeGeneral: 'Resource Type (General)',
  resourceType: 'Resource Type',
  rights: 'Rights',
  rightsUri: 'Rights URI',
  rightsIdentifier: 'Rights Identifier',
  rightsIdentifierScheme: 'Rights ID Scheme',
  description: 'Description',
  descriptionType: 'Description Type',
  ris: 'RIS',
  bibtex: 'BibTeX',
  citeproc: 'Citeproc',
  schemaOrg: 'Schema.org',
  contributorType: 'Contributor Type',
  pointLongitude: 'Longitude',
  pointLatitude: 'Latitude',
  westBoundLongitude: 'West Longitude',
  eastBoundLongitude: 'East Longitude',
  southBoundLatitude: 'South Latitude',
  northBoundLatitude: 'North Latitude',
  geoLocationPlace: 'Place Name',
  funderName: 'Funder Name',
  funderIdentifier: 'Funder ID',
  funderIdentifierType: 'Funder ID Type',
  awardNumber: 'Award Number',
  awardUri: 'Award URI',
  awardTitle: 'Award Title',
  relatedItemType: 'Related Item Type',
  volume: 'Volume',
  issue: 'Issue',
  number: 'Number',
  firstPage: 'First Page',
  lastPage: 'Last Page',
  edition: 'Edition',
};

@Component({
  selector: 'formly-value-binding-editor-type',
  templateUrl: './value-binding-editor.type.html',
  styles: [`
    .binding-card {
      border-left: 3px solid #dee2e6;
      transition: border-color 0.2s, box-shadow 0.2s;
      border-radius: 4px;
    }
    .binding-card.configured { border-left-color: #198754; }
    .binding-card.has-default-only { border-left-color: #0d6efd; }
    .binding-header {
      cursor: pointer;
      user-select: none;
      transition: background-color 0.15s;
      border-radius: 4px;
    }
    .binding-header:hover { background-color: rgba(0,0,0,0.03); }
    .binding-source {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.8rem;
    }
    .binding-badge { font-size: 0.7rem; font-weight: 500; }
  `],
  standalone: false
})
export class ValueBindingEditorTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  readonly bindingKinds: BindingKind[] = ['path', 'handlebars', 'jsonata'];
  private bindingValue: ValueBindingValue = { kind: 'path', path: '' };
  collapsed = true;
  showAdvanced = false;

  ngOnInit(): void {
    this.bindingValue = this.normaliseValue(this.resolveCurrentValue());
    this.syncValue(this.bindingValue);
    this.showAdvanced = this.kind !== 'path';
    this.collapsed = true;
  }

  get value(): ValueBindingValue {
    return this.bindingValue;
  }

  get kind(): BindingKind {
    return this.value.kind || 'path';
  }

  get isConfigured(): boolean {
    if (this.kind === 'path') return !!(this.value.path?.trim());
    if (this.kind === 'handlebars') return !!(this.value.template?.trim());
    if (this.kind === 'jsonata') return !!(this.value.expression?.trim());
    return false;
  }

  get hasDefault(): boolean {
    const dv = this.value.defaultValue;
    return dv != null && String(dv).trim() !== '';
  }

  get summarySource(): string {
    let source = '';
    if (this.kind === 'path') {
      source = this.value.path?.trim() || '';
    } else if (this.kind === 'handlebars') {
      source = this.value.template?.trim() || '';
    } else if (this.kind === 'jsonata') {
      source = this.value.expression?.trim() || '';
    }
    return source.length > 60 ? source.substring(0, 57) + '\u2026' : source;
  }

  get fieldLabel(): string {
    const key = String(this.field.key || '');
    return HUMAN_LABELS[key] || this.camelToTitle(key);
  }

  get fieldKey(): string {
    return String(this.field.key || '');
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }

  toggleAdvanced(): void {
    this.showAdvanced = !this.showAdvanced;
  }

  updateField(key: string, value: unknown): void {
    const nextValue = { ...this.value, [key]: value };
    if (key === 'kind') {
      delete nextValue.path;
      delete nextValue.template;
      delete nextValue.expression;
      this.showAdvanced = value !== 'path';
    }
    this.bindingValue = this.normaliseValue(nextValue);
    this.syncValue(this.bindingValue, true);
  }

  private camelToTitle(key: string): string {
    if (!key) return '';
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }

  private resolveCurrentValue(): ValueBindingValue {
    const modelValue = typeof this.key === 'string' ? (this.model?.[this.key] as ValueBindingValue | undefined) : undefined;
    const controlValue = this.formControl?.value as ValueBindingValue | undefined;
    return modelValue ?? controlValue ?? {};
  }

  private normaliseValue(value: ValueBindingValue): ValueBindingValue {
    const kind = value?.kind || 'path';
    const nextValue: ValueBindingValue = {
      ...value,
      kind
    };

    if (kind === 'path') {
      nextValue.path = nextValue.path || '';
    }

    return nextValue;
  }

  private syncValue(value: ValueBindingValue, markChanged = false): void {
    if (typeof this.key === 'string' && this.model) {
      (this.model as Record<string, ValueBindingValue>)[this.key] = value;
    }

    if (this.formControl) {
      if (typeof (this.formControl as { patchValue?: (val: ValueBindingValue) => void }).patchValue === 'function') {
        (this.formControl as { patchValue: (val: ValueBindingValue) => void }).patchValue(value);
      } else if (typeof (this.formControl as { setValue?: (val: ValueBindingValue) => void }).setValue === 'function') {
        (this.formControl as { setValue: (val: ValueBindingValue) => void }).setValue(value);
      }
      if (markChanged) {
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
      }
    }
  }
}
