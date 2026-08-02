import { Component, Inject, OnInit, Optional } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import {
  FigshareCrosswalkApiService,
  FigshareCrosswalkOption,
  FigshareLocalVocabularyOption
} from '../../services/figshare-crosswalk-api.service';

type BindingKind = 'path' | 'handlebars' | 'jsonata' | 'crosswalk';
type SimpleBindingKind = Exclude<BindingKind, 'crosswalk'>;
type CrosswalkOutput = 'categoryId' | 'label' | 'sourceId';

interface ValueBindingValue {
  kind?: BindingKind;
  path?: string;
  template?: string;
  expression?: string;
  defaultValue?: string;
  /** Crosswalk kind only: the inner binding that supplies the codes. */
  source?: ValueBindingValue;
  sourceVocabularyId?: string;
  crosswalkId?: string;
  outputs?: CrosswalkOutput;
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
  readonly simpleKinds: SimpleBindingKind[] = ['path', 'handlebars', 'jsonata'];
  readonly crosswalkOutputs: CrosswalkOutput[] = ['categoryId', 'label', 'sourceId'];
  private bindingValue: ValueBindingValue = { kind: 'path', path: '' };
  collapsed = true;

  vocabularies: FigshareLocalVocabularyOption[] = [];
  crosswalks: FigshareCrosswalkOption[] = [];
  crosswalksLoading = false;
  crosswalksLoadError = '';
  adminUrl = '';

  constructor(@Optional() @Inject(FigshareCrosswalkApiService) private crosswalkApi?: FigshareCrosswalkApiService) {
    super();
  }

  async ngOnInit(): Promise<void> {
    this.bindingValue = this.normaliseValue(this.resolveCurrentValue());
    this.syncValue(this.bindingValue);
    this.collapsed = true;
    if (this.allowCrosswalk || this.kind === 'crosswalk') {
      await this.loadCrosswalkOptions();
    }
  }

  private async loadCrosswalkOptions(): Promise<void> {
    if (!this.crosswalkApi) {
      this.crosswalksLoadError = 'Figshare crosswalk options are unavailable.';
      return;
    }
    this.crosswalksLoading = true;
    try {
      await this.crosswalkApi.waitForInit();
      this.adminUrl = this.crosswalkApi.getCrosswalkAdminUrl();
      // Memoised in the service, so rendering many bindings costs one round trip.
      this.vocabularies = await this.crosswalkApi.listAllLocalVocabularies();
      this.crosswalks = await this.crosswalkApi.listAllApprovedCrosswalks();
    } catch (_err) {
      this.crosswalksLoadError = 'Unable to load approved Figshare crosswalks.';
    } finally {
      this.crosswalksLoading = false;
    }
  }

  get value(): ValueBindingValue {
    return this.bindingValue;
  }

  get kind(): BindingKind {
    return this.value.kind || 'path';
  }

  /**
   * The crosswalk kind is opt-in per schema. DOI publishing reuses this editor with
   * its own schema and no flag, so the default is deny.
   */
  get allowCrosswalk(): boolean {
    const props = (this.props ?? (this.field as { templateOptions?: Record<string, unknown> })?.templateOptions) as
      | Record<string, unknown>
      | undefined;
    return props?.['allowCrosswalk'] === true;
  }

  /** Always includes the persisted kind so an existing value still renders as selected. */
  get bindingKinds(): BindingKind[] {
    const kinds: BindingKind[] = [...this.simpleKinds];
    if (this.allowCrosswalk || this.kind === 'crosswalk') {
      kinds.push('crosswalk');
    }
    return kinds;
  }

  get sourceKind(): SimpleBindingKind {
    const kind = this.value.source?.kind;
    return kind && kind !== 'crosswalk' ? kind : 'path';
  }

  private isSimpleConfigured(binding: ValueBindingValue | undefined): boolean {
    if (!binding) return false;
    const kind = binding.kind && binding.kind !== 'crosswalk' ? binding.kind : 'path';
    if (kind === 'path') return !!(binding.path?.trim());
    if (kind === 'handlebars') return !!(binding.template?.trim());
    return !!(binding.expression?.trim());
  }

  get crosswalkOptions(): FigshareCrosswalkOption[] {
    const vocabularyId = this.value.sourceVocabularyId?.trim();
    if (!vocabularyId) {
      return this.crosswalks;
    }
    return this.crosswalks.filter((crosswalk) => crosswalk.localVocabularyId === vocabularyId);
  }

  get selectedCrosswalk(): FigshareCrosswalkOption | undefined {
    return this.crosswalks.find((crosswalk) => crosswalk.id === this.value.crosswalkId);
  }

  /** Mirrors the server-side gates so misconfiguration surfaces before a publish attempt. */
  get crosswalkValidationMessage(): string {
    if (this.kind !== 'crosswalk') return '';
    if (!this.isSimpleConfigured(this.value.source)) return 'Configure the source binding that supplies the codes.';
    if (!this.value.sourceVocabularyId) return 'Select a source vocabulary.';
    if (!this.value.crosswalkId) return 'Select an approved crosswalk.';
    if (this.crosswalksLoading || this.crosswalksLoadError) return '';
    const selected = this.selectedCrosswalk;
    if (!selected) return 'The selected crosswalk is not available for this brand.';
    if (selected.localVocabularyId !== this.value.sourceVocabularyId) return 'The crosswalk maps a different local vocabulary.';
    if (selected.approvedRevision == null) return 'Approve a mapping revision before selecting this crosswalk.';
    return '';
  }

  get isConfigured(): boolean {
    if (this.kind === 'path') return !!(this.value.path?.trim());
    if (this.kind === 'handlebars') return !!(this.value.template?.trim());
    if (this.kind === 'jsonata') return !!(this.value.expression?.trim());
    if (this.kind === 'crosswalk') {
      return !!(this.value.crosswalkId?.trim() && this.value.sourceVocabularyId?.trim() && this.isSimpleConfigured(this.value.source));
    }
    return false;
  }

  get hasDefault(): boolean {
    const dv = this.value.defaultValue;
    return dv != null && String(dv).trim() !== '';
  }

  private simpleSummary(binding: ValueBindingValue | undefined): string {
    if (!binding) return '';
    const kind = binding.kind && binding.kind !== 'crosswalk' ? binding.kind : 'path';
    if (kind === 'path') return binding.path?.trim() || '';
    if (kind === 'handlebars') return binding.template?.trim() || '';
    return binding.expression?.trim() || '';
  }

  get summarySource(): string {
    const source = this.kind === 'crosswalk'
      ? `${this.simpleSummary(this.value.source)} \u21e2 ${this.value.outputs || 'categoryId'}`
      : this.simpleSummary(this.value);
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

  updateField(key: string, value: unknown): void {
    const previous = this.value;
    const nextValue = { ...previous, [key]: value } as ValueBindingValue;
    if (key === 'kind') {
      if (value === 'crosswalk') {
        // Carry the existing simple binding inward so the path does not need retyping.
        // The schema declares `source` as a nested object, so formly builds an empty
        // source FormGroup for every binding — presence alone is not enough to tell
        // whether there is anything worth keeping.
        nextValue.source = this.isSimpleConfigured(nextValue.source)
          ? nextValue.source
          : {
              kind: previous.kind === 'crosswalk' ? 'path' : (previous.kind ?? 'path'),
              path: previous.path,
              template: previous.template,
              expression: previous.expression
            };
        nextValue.outputs = nextValue.outputs || 'categoryId';
      } else {
        delete nextValue.source;
        delete nextValue.sourceVocabularyId;
        delete nextValue.crosswalkId;
        delete nextValue.outputs;
      }
      delete nextValue.path;
      delete nextValue.template;
      delete nextValue.expression;
    }
    // A crosswalk is only valid against its own local vocabulary.
    if (key === 'sourceVocabularyId') {
      const selected = this.crosswalks.find((crosswalk) => crosswalk.id === nextValue.crosswalkId);
      if (!value || (selected && selected.localVocabularyId !== value)) {
        nextValue.crosswalkId = '';
      }
    }
    this.bindingValue = this.normaliseValue(nextValue);
    this.syncValue(this.bindingValue, true);
  }

  /** Edit a field of the nested source binding of a crosswalk binding. */
  updateSourceField(key: string, value: unknown): void {
    const source = { ...(this.value.source ?? { kind: 'path' as const }), [key]: value } as ValueBindingValue;
    if (key === 'kind') {
      // Nesting a crosswalk inside a crosswalk is not supported.
      if (value === 'crosswalk') {
        source.kind = 'path';
      }
      delete source.path;
      delete source.template;
      delete source.expression;
    }
    this.bindingValue = this.normaliseValue({ ...this.value, source });
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
    if (controlValue && typeof controlValue === 'object' && Object.keys(controlValue).length > 0) {
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

    if (kind === 'crosswalk') {
      const source = { ...(nextValue.source ?? { kind: 'path' as const }) };
      if (!source.kind || source.kind === 'crosswalk') {
        source.kind = 'path';
      }
      if (source.kind === 'path') {
        source.path = source.path || '';
      }
      nextValue.source = source;
      // An empty control value must fall back too, not just a missing one: the server
      // rejects a categories binding whose outputs is not exactly 'categoryId'.
      nextValue.outputs = nextValue.outputs || 'categoryId';
      nextValue.sourceVocabularyId = nextValue.sourceVocabularyId ?? '';
      nextValue.crosswalkId = nextValue.crosswalkId ?? '';
    }

    return nextValue;
  }

  /**
   * Reduce the editor's working value to the keys that belong in the persisted
   * binding, dropping empty source fields and the source fields that do not apply
   * to the active kind. This mirrors what formly's parsers would do for rendered
   * controls and keeps the saved config free of empty/stale entries.
   */
  private static hasText(val: unknown): boolean {
    return val != null && String(val).trim() !== '';
  }

  /** Reduce a simple (non-crosswalk) binding to its persisted keys. */
  private toSimpleModelValue(value: ValueBindingValue): Record<string, unknown> {
    const hasText = ValueBindingEditorTypeComponent.hasText;
    const kind: SimpleBindingKind = value.kind && value.kind !== 'crosswalk' ? value.kind : 'path';
    const next: Record<string, unknown> = { kind };

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

  private toModelValue(value: ValueBindingValue): Record<string, unknown> {
    const hasText = ValueBindingEditorTypeComponent.hasText;
    if ((value.kind ?? 'path') !== 'crosswalk') {
      return this.toSimpleModelValue(value);
    }

    // The crosswalk ids are emitted even when blank so a half-configured binding
    // round-trips and the server reports it clearly rather than as a missing key.
    const next: Record<string, unknown> = {
      kind: 'crosswalk',
      source: this.toSimpleModelValue(value.source ?? { kind: 'path' }),
      sourceVocabularyId: value.sourceVocabularyId ?? '',
      crosswalkId: value.crosswalkId ?? '',
      outputs: value.outputs || 'categoryId'
    };
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
      // Merge the nested source in place first: replacing the object reference on
      // every keystroke would detach formly's binding to it.
      const existingSource = model['source'];
      if (next['source'] && existingSource && typeof existingSource === 'object' && !Array.isArray(existingSource)) {
        const merged = existingSource as Record<string, unknown>;
        Object.keys(merged).forEach(key => delete merged[key]);
        Object.assign(merged, next['source']);
        next['source'] = merged;
      }
      Object.keys(model).forEach(key => delete model[key]);
      Object.assign(model, next);
    }

    // Keep the FormGroup in sync for completeness. Only patch controls that exist:
    // the DOI schema builds a FormGroup with the five simple keys and no crosswalk
    // controls, so a blind patch would be dropped or throw.
    if (this.formControl) {
      const desired: Record<string, unknown> = {
        kind: next['kind'] ?? 'path',
        path: next['path'] ?? '',
        template: next['template'] ?? '',
        expression: next['expression'] ?? '',
        defaultValue: next['defaultValue'] ?? '',
        sourceVocabularyId: next['sourceVocabularyId'] ?? '',
        crosswalkId: next['crosswalkId'] ?? '',
        outputs: next['outputs'] ?? '',
        // Always a full shape so a partial patch cannot leave stale siblings behind.
        source: {
          kind: 'path',
          path: '',
          template: '',
          expression: '',
          defaultValue: '',
          ...((next['source'] as Record<string, unknown> | undefined) ?? {})
        }
      };
      const group = this.formControl as unknown as { contains?: (key: string) => boolean };
      const patch: Record<string, unknown> = typeof group.contains === 'function'
        ? Object.fromEntries(Object.entries(desired).filter(([key]) => group.contains?.(key)))
        : desired;
      const control = this.formControl as {
        patchValue?: (val: unknown, options?: { emitEvent?: boolean; onlySelf?: boolean }) => void;
        setValue?: (val: unknown, options?: { emitEvent?: boolean; onlySelf?: boolean }) => void;
      };
      if (typeof control.patchValue === 'function') {
        control.patchValue(patch, { emitEvent: false });
      } else if (typeof control.setValue === 'function') {
        control.setValue(patch, { emitEvent: false });
      }
      if (markChanged) {
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
      }
    }
  }
}
