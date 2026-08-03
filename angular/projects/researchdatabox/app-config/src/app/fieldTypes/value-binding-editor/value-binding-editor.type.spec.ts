import { FormControl, FormGroup } from '@angular/forms';
import { ValueBindingEditorTypeComponent } from './value-binding-editor.type';
import {
  FigshareCrosswalkApiService,
  FigshareCrosswalkOption,
  FigshareLocalVocabularyOption
} from '../../services/figshare-crosswalk-api.service';

/**
 * The model/FormGroup sync in this component is the highest-risk part of the crosswalk
 * binding work: before it was split, `toModelValue` emitted only `{kind, <one source
 * field>, defaultValue}`, so a crosswalk's `source` and `crosswalkId` were dropped on
 * every keystroke. These specs pin that down, along with the DOI gating — DOI publishing
 * reuses this editor with a FormGroup that has no crosswalk controls.
 */
describe('ValueBindingEditorTypeComponent', () => {
  const VOCABULARIES: FigshareLocalVocabularyOption[] = [
    { id: 'vocab-1', name: 'figgy', slug: 'figgy', source: 'local' },
    { id: 'vocab-2', name: 'other', slug: 'other', source: 'local' }
  ];

  function crosswalkOption(overrides: Partial<FigshareCrosswalkOption> = {}): FigshareCrosswalkOption {
    return {
      id: 'crosswalk-1',
      name: 'figgy → Figshare taxonomy 100',
      status: 'approved',
      workingRevision: 1,
      approvedRevision: 1,
      localVocabularyId: 'vocab-1',
      localVocabularyName: 'figgy',
      figshareSourceId: 'source-1',
      figshareSourceName: 'Figshare taxonomy 100',
      scope: 'public',
      taxonomyId: '100',
      approvedMappingCount: 50,
      workingMappingCount: 50,
      historicalTargetCount: 0,
      ...overrides
    };
  }

  /** The full set of controls the Figshare schema builds, including the crosswalk ones. */
  function figshareFormGroup(): FormGroup {
    return new FormGroup({
      kind: new FormControl('path'),
      path: new FormControl(''),
      template: new FormControl(''),
      expression: new FormControl(''),
      defaultValue: new FormControl(''),
      sourceVocabularyId: new FormControl(''),
      crosswalkId: new FormControl(''),
      outputs: new FormControl(''),
      source: new FormGroup({
        kind: new FormControl('path'),
        path: new FormControl(''),
        template: new FormControl(''),
        expression: new FormControl(''),
        defaultValue: new FormControl('')
      })
    });
  }

  /** DOI reuses the shared editor with only the five simple controls. */
  function doiFormGroup(): FormGroup {
    return new FormGroup({
      kind: new FormControl('path'),
      path: new FormControl(''),
      template: new FormControl(''),
      expression: new FormControl(''),
      defaultValue: new FormControl('')
    });
  }

  function fakeApi(crosswalks: FigshareCrosswalkOption[] = [crosswalkOption()]): FigshareCrosswalkApiService {
    return {
      waitForInit: () => Promise.resolve(),
      getCrosswalkAdminUrl: () => '/admin/figshareVocabularies',
      listAllLocalVocabularies: () => Promise.resolve(VOCABULARIES),
      listAllApprovedCrosswalks: () => Promise.resolve(crosswalks)
    } as unknown as FigshareCrosswalkApiService;
  }

  interface SetupOptions {
    model?: Record<string, unknown>;
    allowCrosswalk?: boolean;
    doi?: boolean;
    crosswalks?: FigshareCrosswalkOption[];
    withApi?: boolean;
  }

  function setup(options: SetupOptions = {}) {
    const { model = { kind: 'path', path: 'metadata.forCodes' }, allowCrosswalk = true, doi = false } = options;
    const api = options.withApi === false ? undefined : fakeApi(options.crosswalks);
    const component = new ValueBindingEditorTypeComponent(api);
    const formControl = doi ? doiFormGroup() : figshareFormGroup();
    // Formly builds the FormGroup from the persisted value, and the component treats
    // that group as the source of truth — so the two have to agree here as well.
    formControl.patchValue(model);

    Object.defineProperty(component, 'key', { value: 'categories' });
    Object.defineProperty(component, 'model', { value: model });
    Object.defineProperty(component, 'formControl', { value: formControl });
    Object.defineProperty(component, 'field', {
      value: { key: 'categories', props: allowCrosswalk ? { allowCrosswalk: true } : {} }
    });
    Object.defineProperty(component, 'props', { value: allowCrosswalk ? { allowCrosswalk: true } : {} });

    return { component, formControl, model };
  }

  const crosswalkModel = () => ({
    kind: 'crosswalk',
    source: { kind: 'path', path: 'metadata.forCodes' },
    sourceVocabularyId: 'vocab-1',
    crosswalkId: 'crosswalk-1',
    outputs: 'categoryId'
  });

  describe('kind gating', () => {
    it('offers the crosswalk kind when the schema allows it', async () => {
      const { component } = setup();

      await component.ngOnInit();

      expect(component.bindingKinds).toEqual(['path', 'handlebars', 'jsonata', 'crosswalk']);
    });

    it('withholds the crosswalk kind for DOI, which does not set the flag', async () => {
      const { component } = setup({ allowCrosswalk: false, doi: true });

      await component.ngOnInit();

      expect(component.bindingKinds).toEqual(['path', 'handlebars', 'jsonata']);
    });

    /** A legacy value must still render as selected even where the kind is not offered. */
    it('still lists a persisted crosswalk kind when the flag is absent', async () => {
      const { component } = setup({ allowCrosswalk: false, model: crosswalkModel() });

      await component.ngOnInit();

      expect(component.bindingKinds).toContain('crosswalk');
    });

    it('does not load crosswalk options when the kind is not allowed', async () => {
      const { component } = setup({ allowCrosswalk: false, doi: true });

      await component.ngOnInit();

      expect(component.crosswalks).toEqual([]);
      expect(component.vocabularies).toEqual([]);
    });

    it('loads vocabularies and crosswalks when the kind is allowed', async () => {
      const { component } = setup();

      await component.ngOnInit();

      expect(component.vocabularies).toEqual(VOCABULARIES);
      expect(component.crosswalks.length).toBe(1);
      expect(component.adminUrl).toBe('/admin/figshareVocabularies');
      expect(component.crosswalksLoadError).toBe('');
    });

    it('reports a load error when the crosswalk service is not provided', async () => {
      const { component } = setup({ withApi: false });

      await component.ngOnInit();

      expect(component.crosswalksLoadError).toContain('unavailable');
    });
  });

  describe('persistence', () => {
    /** The regression the split of toModelValue exists to prevent. */
    it('round-trips a crosswalk binding without dropping source or crosswalkId', async () => {
      const { component, model } = setup({ model: crosswalkModel() });

      await component.ngOnInit();

      expect(model).toEqual({
        kind: 'crosswalk',
        source: { kind: 'path', path: 'metadata.forCodes' },
        sourceVocabularyId: 'vocab-1',
        crosswalkId: 'crosswalk-1',
        outputs: 'categoryId'
      });
    });

    it('keeps source and crosswalkId across repeated edits', async () => {
      const { component, model } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      component.updateField('defaultValue', 'x');
      component.updateSourceField('path', 'metadata.anzsrcFor');
      component.updateField('outputs', 'label');

      expect(model).toEqual({
        kind: 'crosswalk',
        source: { kind: 'path', path: 'metadata.anzsrcFor' },
        sourceVocabularyId: 'vocab-1',
        crosswalkId: 'crosswalk-1',
        outputs: 'label',
        defaultValue: 'x'
      });
    });

    /** Replacing the reference would detach formly's binding to the nested object. */
    it('merges the nested source in place rather than replacing the object', async () => {
      const { component, model } = setup({ model: crosswalkModel() });
      await component.ngOnInit();
      const sourceRef = (model as any).source;

      component.updateSourceField('path', 'metadata.other');

      expect((model as any).source).toBe(sourceRef);
      expect(sourceRef.path).toBe('metadata.other');
    });

    it('emits blank crosswalk ids so a half-configured binding still round-trips', async () => {
      const { component, model } = setup({
        model: { kind: 'crosswalk', source: { kind: 'path', path: 'metadata.forCodes' } }
      });

      await component.ngOnInit();

      expect(model).toEqual({
        kind: 'crosswalk',
        source: { kind: 'path', path: 'metadata.forCodes' },
        sourceVocabularyId: '',
        crosswalkId: '',
        outputs: 'categoryId'
      });
    });

    it('reduces a simple binding to only its own source key', async () => {
      const { component, model } = setup({ model: { kind: 'path', path: 'metadata.forCodes' } });
      await component.ngOnInit();

      component.updateField('kind', 'handlebars');
      component.updateField('template', '{{metadata.title}}');

      expect(model).toEqual({ kind: 'handlebars', template: '{{metadata.title}}' });
    });

    /** DOI's FormGroup has no crosswalk controls; a blind patch would throw or be dropped. */
    it('patches only the controls that exist on the form group', async () => {
      const { component, formControl } = setup({ allowCrosswalk: false, doi: true });

      await component.ngOnInit();
      component.updateField('path', 'metadata.title');

      expect(Object.keys(formControl.value).sort())
        .toEqual(['defaultValue', 'expression', 'kind', 'path', 'template']);
      expect(formControl.get('path')?.value).toBe('metadata.title');
    });

    it('patches the crosswalk controls when the form group has them', async () => {
      const { component, formControl } = setup({ model: crosswalkModel() });

      await component.ngOnInit();

      expect(formControl.get('crosswalkId')?.value).toBe('crosswalk-1');
      expect(formControl.get('sourceVocabularyId')?.value).toBe('vocab-1');
      expect(formControl.get('outputs')?.value).toBe('categoryId');
      expect(formControl.get('source')?.value).toEqual({
        kind: 'path',
        path: 'metadata.forCodes',
        template: '',
        expression: '',
        defaultValue: ''
      });
    });
  });

  describe('switching kind', () => {
    it('carries an existing path inward when switching to crosswalk', async () => {
      const { component, model } = setup({ model: { kind: 'path', path: 'metadata.forCodes' } });
      await component.ngOnInit();

      component.updateField('kind', 'crosswalk');

      expect((model as any).source).toEqual({ kind: 'path', path: 'metadata.forCodes' });
      expect((model as any).outputs).toBe('categoryId');
      // The path moved inward; it must not linger at the top level too.
      expect((model as any).path).toBeUndefined();
    });

    it('carries a handlebars template inward when switching to crosswalk', async () => {
      const { component, model } = setup({ model: { kind: 'handlebars', template: '{{x}}' } });
      await component.ngOnInit();

      component.updateField('kind', 'crosswalk');

      expect((model as any).source).toEqual({ kind: 'handlebars', template: '{{x}}' });
    });

    it('drops the crosswalk keys when switching back to a simple kind', async () => {
      const { component, model } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      component.updateField('kind', 'path');

      expect(model).toEqual({ kind: 'path' });
    });

    /** Mirrors the runtime guard in resolveCrosswalkBinding. */
    it('refuses to nest a crosswalk inside a crosswalk', async () => {
      const { component, model } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      component.updateSourceField('kind', 'crosswalk');

      expect((model as any).source.kind).toBe('path');
      expect(component.sourceKind).toBe('path');
    });

    it('clears the source field that no longer applies to the inner kind', async () => {
      const { component, model } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      component.updateSourceField('kind', 'jsonata');
      component.updateSourceField('expression', 'metadata.codes');

      expect((model as any).source).toEqual({ kind: 'jsonata', expression: 'metadata.codes' });
    });
  });

  describe('crosswalk selection', () => {
    it('filters offered crosswalks by the selected vocabulary', async () => {
      const { component } = setup({
        model: crosswalkModel(),
        crosswalks: [crosswalkOption(), crosswalkOption({ id: 'crosswalk-2', localVocabularyId: 'vocab-2' })]
      });
      await component.ngOnInit();

      expect(component.crosswalkOptions.map(c => c.id)).toEqual(['crosswalk-1']);
    });

    it('offers every crosswalk when no vocabulary is selected', async () => {
      const { component } = setup({
        model: { kind: 'crosswalk', source: { kind: 'path', path: 'a' } },
        crosswalks: [crosswalkOption(), crosswalkOption({ id: 'crosswalk-2', localVocabularyId: 'vocab-2' })]
      });
      await component.ngOnInit();

      expect(component.crosswalkOptions.length).toBe(2);
    });

    it('clears an incompatible crosswalk when the vocabulary changes', async () => {
      const { component, model } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      component.updateField('sourceVocabularyId', 'vocab-2');

      expect((model as any).crosswalkId).toBe('');
    });

    it('clears the crosswalk when the vocabulary is unset', async () => {
      const { component, model } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      component.updateField('sourceVocabularyId', '');

      expect((model as any).crosswalkId).toBe('');
    });

    it('keeps a compatible crosswalk when the vocabulary is re-selected', async () => {
      const { component, model } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      component.updateField('sourceVocabularyId', 'vocab-1');

      expect((model as any).crosswalkId).toBe('crosswalk-1');
    });
  });

  describe('validation and summary', () => {
    it('reports no validation problem for a fully configured crosswalk', async () => {
      const { component } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      expect(component.crosswalkValidationMessage).toBe('');
      expect(component.isConfigured).toBeTrue();
    });

    it('asks for the source binding first', async () => {
      const { component } = setup({ model: { ...crosswalkModel(), source: { kind: 'path', path: '' } } });
      await component.ngOnInit();

      expect(component.crosswalkValidationMessage).toContain('source binding');
      expect(component.isConfigured).toBeFalse();
    });

    it('asks for a vocabulary, then a crosswalk', async () => {
      const { component } = setup({
        model: { kind: 'crosswalk', source: { kind: 'path', path: 'metadata.forCodes' } }
      });
      await component.ngOnInit();

      expect(component.crosswalkValidationMessage).toBe('Select a source vocabulary.');

      component.updateField('sourceVocabularyId', 'vocab-1');
      expect(component.crosswalkValidationMessage).toBe('Select an approved crosswalk.');
    });

    it('flags a crosswalk that is not available for the brand', async () => {
      const { component } = setup({ model: crosswalkModel(), crosswalks: [] });
      await component.ngOnInit();

      expect(component.crosswalkValidationMessage).toContain('not available for this brand');
    });

    it('flags a crosswalk with no approved revision', async () => {
      const { component } = setup({
        model: crosswalkModel(),
        crosswalks: [crosswalkOption({ approvedRevision: null })]
      });
      await component.ngOnInit();

      expect(component.crosswalkValidationMessage).toContain('Approve a mapping revision');
    });

    it('summarises a crosswalk as its inner source and output mode', async () => {
      const { component } = setup({ model: crosswalkModel() });
      await component.ngOnInit();

      expect(component.summarySource).toContain('metadata.forCodes');
      expect(component.summarySource).toContain('categoryId');
    });

    it('summarises a simple binding as its source expression', async () => {
      const { component } = setup({ model: { kind: 'jsonata', expression: 'metadata.codes' } });
      await component.ngOnInit();

      expect(component.summarySource).toBe('metadata.codes');
    });
  });
});
