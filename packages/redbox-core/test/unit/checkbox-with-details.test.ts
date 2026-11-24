import assert from 'node:assert/strict';
import {
  CheckboxWithDetailsFormComponentDefinitionFrame,
  consoleLogger,
  FormConfigFrame,
  formValidatorsSharedDefinitions,
  handlebarsCompile,
} from '@researchdatabox/sails-ng-common';
import {
  ClientFormConfigVisitor,
  ConstructFormConfigVisitor,
  ValidatorFormConfigVisitor,
  VocabInlineFormConfigVisitor,
} from '../../src';

const other = 'other./~:format';
const row = (value: string, details: Record<string, string | null> = {}) => ({ value, details });

function definition(): CheckboxWithDetailsFormComponentDefinitionFrame {
  return {
    name: 'formats',
    component: {
      class: 'CheckboxWithDetailsComponent',
      config: {
        options: [
          { value: 'table', label: 'Tabulated files' },
          { value: other, label: 'Other files' },
        ],
        detailFields: [
          {
            name: 'volume',
            component: { class: 'SimpleInputComponent' },
            layout: { class: 'DefaultLayout', config: { label: 'Volume' } },
            model: { class: 'SimpleInputModel', config: { validators: [{ class: 'required' }] } },
          },
        ],
        detailFieldsByValue: {
          [other]: [
            {
              name: 'description',
              component: { class: 'TextAreaComponent', config: { rows: 2 } },
              layout: { class: 'DefaultLayout', config: { label: 'Description' } },
              model: { class: 'TextAreaModel', config: { validators: [{ class: 'required' }] } },
            },
          ],
        },
      },
    },
    model: { class: 'CheckboxWithDetailsModel', config: { validators: [{ class: 'required' }] } },
  };
}

function frame(field = definition()): FormConfigFrame {
  return { name: 'checkbox-details-test', componentDefinitions: [field] };
}

describe('Checkbox with details form', () => {
  it('preserves stable codes in edit mode and builds labelled, escaped view content', async () => {
    const field = definition();
    field.component.config!.options!.reverse();
    const saved = [
      row('table', { volume: 'About 200 files' }),
      row(other, { volume: '3 TB', description: '<script>input</script>\nsecond line' }),
    ];
    const record = { formats: saved };
    const construct = (formMode: 'edit' | 'view') =>
      new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(field), record, formMode });

    const edit = await new ClientFormConfigVisitor(consoleLogger).start({
      form: await construct('edit'),
      formMode: 'edit',
    });
    const leaf = edit!.componentDefinitions[0];
    assert.deepEqual(leaf.model?.config?.value, saved);
    const view = await new ClientFormConfigVisitor(consoleLogger).start({
      form: await construct('view'),
      formMode: 'view',
    });
    const output = view!.componentDefinitions[0];
    assert.equal(output.component.class, 'ContentComponent');
    const config = output.component.config as { content: unknown; template: string };
    const rendered = handlebarsCompile(config.template)({ content: config.content });
    assert.match(
      rendered,
      /Tabulated files.*Volume.*About 200 files.*Other files.*Volume.*3 TB.*Description.*second line/s
    );
    assert.ok(rendered.includes('<dd>&lt;script&gt;input&lt;/script&gt;<br>second line</dd>'));
    assert.doesNotMatch(rendered, /other\.\//);
  });

  it('keeps Other-only rows, including inside repeated groups, in generated View', async () => {
    const field = definition();
    delete field.component.config!.detailFields;
    const data: FormConfigFrame = {
      name: 'checkbox-details-repeatable',
      componentDefinitions: [
        {
          name: 'projects',
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                component: { class: 'GroupComponent', config: { componentDefinitions: [field] } },
              },
            },
          },
        },
      ],
    };
    const record = {
      projects: [{ formats: [row('table')] }, { formats: [row(other, { description: 'Custom exports' })] }],
    };
    const render = async (mode: 'edit' | 'view') => {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data, formMode: mode, record });
      return new ClientFormConfigVisitor(consoleLogger).start({ form, formMode: mode });
    };
    assert.deepEqual((await render('edit'))!.componentDefinitions[0].model?.config?.value, record.projects);
    const output = (await render('view'))!.componentDefinitions[0].component.config as {
      content: unknown;
      template: string;
    };
    const rendered = handlebarsCompile(output.template)({ content: output.content });
    assert.match(rendered, /Tabulated files.*Other files.*Description.*Custom exports/s);
  });

  it('renders a single selection from 2,400 options in standalone and repeated view templates', async () => {
    const field = definition();
    const config = field.component.config!;
    config.options = Array.from({ length: 2400 }, (_, index) => ({ value: `code-${index}`, label: `Format ${index}` }));
    delete config.detailFieldsByValue;
    const formats = [row('code-2399', { volume: '3 TB' })];
    const data = frame(field);
    data.componentDefinitions.push({
      name: 'projects',
      component: {
        class: 'RepeatableComponent',
        config: {
          elementTemplate: {
            name: '',
            component: { class: 'GroupComponent', config: { componentDefinitions: [field] } },
          },
        },
      },
    });
    const form = await new ConstructFormConfigVisitor(consoleLogger).start({
      data,
      formMode: 'view',
      record: { formats, projects: [{ formats }] },
    });
    const view = await new ClientFormConfigVisitor(consoleLogger).start({ form, formMode: 'view' });
    for (const definition of view!.componentDefinitions) {
      const output = definition.component.config as { content: unknown; template: string };
      assert.match(handlebarsCompile(output.template)({ content: output.content }), /Format 2399.*Volume.*3 TB/s);
      assert.ok(output.template.length < 3000, 'template size should be independent of the number of options');
    }
  });

  it('allows a retired selection to move with a repeatable row without giving another field or row a copy', async () => {
    const archived = row('archived', { volume: '1 TB' });
    const first = { name: 'First', formats: [], otherFormats: [] };
    const second = { name: 'Second', formats: [archived], otherFormats: [] };
    const third = { name: 'Third', formats: [], otherFormats: [] };
    const previousMetadata = { projects: [first, second, third] };
    const field = definition();
    const sibling = { ...definition(), name: 'otherFormats' };
    const data: FormConfigFrame = {
      name: 'checkbox-details-repeatable-validation',
      componentDefinitions: [
        {
          name: 'projects',
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                component: { class: 'GroupComponent', config: { componentDefinitions: [field, sibling] } },
              },
            },
          },
        },
      ],
    };
    const validate = async (projects: unknown[]) => {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data, record: { projects } });
      return new ValidatorFormConfigVisitor(consoleLogger).start({
        form,
        previousMetadata,
        enabledValidationGroups: ['none'],
      });
    };
    assert.deepEqual(await validate(previousMetadata.projects), []);
    assert.deepEqual(await validate([second, third]), []);
    assert.deepEqual(await validate([third, first, second]), []);
    for (const projects of [
      [second, second],
      [{ ...first, formats: [archived] }, second],
      [first, { ...second, otherFormats: [archived] }, third],
      [first, { ...second, formats: [row('archived', { volume: '2 TB' })] }, third],
    ]) {
      const errors = await validate(projects);
      assert.equal(errors.length, 1);
      assert.match(errors[0].errors[0].message, /checkbox-details-(option|field)/);
    }
  });

  it('uses normal validation groups for selected details and points to the exact row', async () => {
    const metadata = {
      formats: [row('table', { volume: '2 CSV files' }), row(other, { description: 'Instrument bundles' })],
    };
    const validate = async (group: string) => {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(), record: metadata });
      return new ValidatorFormConfigVisitor(consoleLogger).start({
        form,
        enabledValidationGroups: [group],
        validatorDefinitions: formValidatorsSharedDefinitions,
      });
    };
    assert.deepEqual(await validate('none'), []);
    const errors = await validate('all');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'Volume — Other files');
    assert.deepEqual(errors[0].lineagePaths?.dataModel, ['formats', 1, 'details', 'volume']);
    assert.equal(errors[0].lineagePaths?.angularComponentsJsonPointer, '/formats/option:other.~1~0:format/volume');
  });

  it('preserves retired data from the stored record and rejects new unavailable codes and duplicate rows', async () => {
    const archival = row('removed', { volume: '1 TB', notes: 'Before retirement' });
    const validate = async (formats: unknown, previousMetadata?: Record<string, unknown>) => {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(), record: { formats } });
      return new ValidatorFormConfigVisitor(consoleLogger).start({
        form,
        enabledValidationGroups: ['none'],
        previousMetadata,
      });
    };
    assert.deepEqual(await validate([archival], { formats: [archival] }), []);
    assert.equal((await validate([archival]))[0].errors[0].message, '@validator-error-checkbox-details-option');
    assert.equal(
      (await validate([row('table'), row('table')]))[0].errors[0].message,
      '@validator-error-checkbox-details-option'
    );
    assert.equal(
      (await validate([row('table', { description: 'belongs to Other' })]))[0].errors[0].message,
      '@validator-error-checkbox-details-field'
    );
    assert.equal(
      (await validate([{ value: 'table' }]))[0].errors[0].message,
      '@validator-error-checkbox-details-shape'
    );
  });

  it('retains an authored mapping after vocabulary deletion only when the stored field contains the code', async () => {
    const field = definition();
    delete field.component.config!.options;
    Object.assign(field.component.config!, { vocabRef: 'formats', inlineVocab: true });
    const formats = [row(other, { volume: '3 TB', description: 'Instrument bundles', oldNote: 'Original notes' })];
    const record = { formats };
    const service = Object.getOwnPropertyDescriptor(globalThis, 'VocabularyService');
    try {
      Object.defineProperty(globalThis, 'VocabularyService', {
        configurable: true,
        value: {
          getEntries: async () => ({ meta: { total: 1 }, entries: [{ label: 'Tabulated files', value: 'table' }] }),
        },
      });
      const construct = (mode: 'edit' | 'view', checkboxArchiveRecord?: Record<string, unknown> | null) =>
        new ConstructFormConfigVisitor(consoleLogger).start({
          data: frame(field),
          formMode: mode,
          record,
          checkboxArchiveRecord,
        });
      const resolve = (form: Awaited<ReturnType<typeof construct>>) =>
        new VocabInlineFormConfigVisitor(consoleLogger).resolveVocabs(form, 'default');
      await assert.rejects(resolve(await construct('edit', null)), /unknown option/);
      await assert.rejects(resolve(await construct('edit', { otherFormats: formats })), /unknown option/);

      const source = await construct('edit', record);
      await resolve(source);
      const validation = await new ValidatorFormConfigVisitor(consoleLogger).start({
        form: source,
        previousMetadata: record,
        enabledValidationGroups: ['all'],
        validatorDefinitions: formValidatorsSharedDefinitions,
      });
      assert.deepEqual(validation, []);
      const edit = await new ClientFormConfigVisitor(consoleLogger).start({ form: source, formMode: 'edit' });
      assert.deepEqual(edit!.componentDefinitions[0].model?.config?.value, formats);

      const viewSource = await construct('view', record);
      await resolve(viewSource);
      const view = await new ClientFormConfigVisitor(consoleLogger).start({ form: viewSource, formMode: 'view' });
      const output = view!.componentDefinitions[0].component.config as { content: unknown; template: string };
      const rendered = handlebarsCompile(output.template)({ content: output.content });
      assert.match(rendered, /other\.\/.*Volume.*3 TB.*Description.*Instrument bundles.*oldNote.*Original notes/s);
    } finally {
      if (service) Object.defineProperty(globalThis, 'VocabularyService', service);
      else Reflect.deleteProperty(globalThis, 'VocabularyService');
    }
  });

  it('uses the retired label when available and renders older detail keys without exposing hidden details', async () => {
    const field = definition();
    const config = field.component.config!;
    config.options!.push({ value: 'retired', label: '@old-format', historical: true });
    config.detailFields!.push({
      name: 'hiddenNote',
      component: { class: 'SimpleInputComponent', config: { visible: false } },
    });
    const form = await new ConstructFormConfigVisitor(consoleLogger).start({
      data: frame(field),
      formMode: 'view',
      record: { formats: [row('retired', { volume: '1 TB', oldNote: 'Original notes', hiddenNote: 'Hidden answer' })] },
    });
    const view = await new ClientFormConfigVisitor(consoleLogger).start({ form, formMode: 'view' });
    const output = view!.componentDefinitions[0].component.config as { content: unknown; template: string };
    const translationService = { t: (key: string) => (key === '@old-format' ? 'Retired format label' : key) };
    const rendered = handlebarsCompile(output.template)({ content: output.content, translationService });
    assert.match(rendered, /Retired format label.*Volume.*1 TB.*oldNote.*Original notes/s);
    assert.doesNotMatch(rendered, /Hidden answer/);
  });

  it('checks duplicate names and option-specific mappings when vocabulary options resolve', async () => {
    const construct = (field: CheckboxWithDetailsFormComponentDefinitionFrame) =>
      new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(field) });
    const field = definition();
    field.component.config!.detailFieldsByValue![other][0].name = 'volume';
    await assert.rejects(construct(field), /duplicate checkbox detail field name/);

    const vocabularyField = definition();
    delete vocabularyField.component.config!.options;
    vocabularyField.component.config!.vocabRef = 'formats';
    const service = Object.getOwnPropertyDescriptor(globalThis, 'VocabularyService');
    try {
      const mockEntries = [{ label: 'Other files', value: other, historical: true }];
      Object.defineProperty(globalThis, 'VocabularyService', {
        configurable: true,
        value: { getEntries: async () => ({ meta: { total: mockEntries.length }, entries: mockEntries }) },
      });
      const form = await construct(vocabularyField);
      await new VocabInlineFormConfigVisitor(consoleLogger).resolveVocabs(form, 'default', {
        resolveDeferredCheckboxDetails: true,
      });
      assert.deepEqual(
        (form.componentDefinitions[0].component.config as typeof vocabularyField.component.config)?.options,
        [{ label: 'Other files', value: other, historical: true }]
      );
      mockEntries.splice(0);
      await assert.rejects(
        new VocabInlineFormConfigVisitor(consoleLogger).resolveVocabs(form, 'default', {
          resolveDeferredCheckboxDetails: true,
        }),
        /unknown option/
      );
    } finally {
      if (service) Object.defineProperty(globalThis, 'VocabularyService', service);
      else Reflect.deleteProperty(globalThis, 'VocabularyService');
    }
  });
});
