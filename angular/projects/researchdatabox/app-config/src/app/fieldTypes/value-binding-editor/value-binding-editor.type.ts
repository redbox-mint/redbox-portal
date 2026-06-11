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
    .binding-summary {
      max-width: 400px;
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
    // The schema models each binding as a JSON Schema object, so formly builds an
    // object field: this.formControl is a FormGroup whose value is the binding
    // itself, and this.model is the binding object (NOT the parent). The FormGroup
    // value is the source of truth; fall back to the model object directly.
    const controlValue = this.formControl?.value as ValueBindingValue | undefined;
    if (controlValue && typeof controlValue === 'object') {
      return controlValue;
    }
    return (this.model as ValueBindingValue | undefined) ?? {};
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

  /**
   * Reduce the editor's working value to the keys that belong in the persisted
   * binding, dropping empty source fields and the source fields that do not apply
   * to the active kind. This mirrors what formly's parsers would do for rendered
   * controls and keeps the saved config free of empty/stale entries.
   */
  private toModelValue(value: ValueBindingValue): Record<string, unknown> {
    const kind: BindingKind = value.kind || 'path';
    const next: Record<string, unknown> = { kind };

    const hasText = (val: unknown): boolean => val != null && String(val).trim() !== '';

    if (kind === 'path' && hasText(value.path)) {
      next['path'] = value.path;
    } else if (kind === 'handlebars' && hasText(value.template)) {
      next['template'] = value.template;
    } else if (kind === 'jsonata' && hasText(value.expression)) {
      next['expression'] = value.expression;
    }

    if (hasText(value.defaultValue)) {
      next['defaultValue'] = value.defaultValue;
    }

    return next;
  }

  private syncValue(value: ValueBindingValue, markChanged = false): void {
    // this.model IS the binding object (the schema models each binding as a JSON
    // Schema object, so formly builds an object field whose model is the object
    // itself, not the parent). The binding's child controls (kind/path/...) are
    // never rendered as formly-fields, so formly never wires them back into the
    // model; we must mutate the model object in place. Writing the whole value to
    // this.model[this.key] (the previous behaviour) self-nested it, e.g. created
    // description.description. Reusing the same object reference keeps formly's
    // model binding intact.
    const next = this.toModelValue(value);

    const model = this.model as Record<string, unknown> | undefined;
    if (model && typeof model === 'object') {
      Object.keys(model).forEach(key => delete model[key]);
      Object.assign(model, next);
    }

    // Keep the FormGroup in sync for completeness; child controls cover all five
    // source fields, so a full patch clears any that no longer apply.
    if (this.formControl) {
      const patch: Record<string, unknown> = {
        kind: next['kind'] ?? 'path',
        path: next['path'] ?? '',
        template: next['template'] ?? '',
        expression: next['expression'] ?? '',
        defaultValue: next['defaultValue'] ?? ''
      };
      const control = this.formControl as {
        patchValue?: (val: unknown) => void;
        setValue?: (val: unknown) => void;
      };
      if (typeof control.patchValue === 'function') {
        control.patchValue(patch);
      } else if (typeof control.setValue === 'function') {
        control.setValue(patch);
      }
      if (markChanged) {
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
      }
    }
  }
}
