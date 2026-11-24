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
    assert.doesNotMatch(rendered, /<script>|other\.\//);
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
