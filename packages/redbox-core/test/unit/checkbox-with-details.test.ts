import assert from 'node:assert/strict';
import {
  CheckboxWithDetailsFormComponentDefinitionFrame,
  RepeatableFormComponentDefinitionOutline,
  QuestionTreeFormComponentDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
  consoleLogger,
  FormConfigFrame,
  formValidatorsSharedDefinitions,
  handlebarsCompile,
} from '@researchdatabox/sails-ng-common';
import {
  ClientFormConfigVisitor,
  ConstructFormConfigVisitor,
  ContextVariablesFormConfigVisitor,
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
    field.constraints = { allowModes: ['edit', 'view'] };
    const saved = [
      row('table', { volume: 'About 200 files' }),
      row(other, { volume: '3 TB', description: '<script>input</script>\nsecond line' }),
    ];
    const expectedRows = structuredClone(saved);
    const record = { formats: saved };
    const construct = (formMode: 'edit' | 'view') =>
      new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(field), record, formMode });

    const edit = await new ClientFormConfigVisitor(consoleLogger).start({
      form: await construct('edit'),
      formMode: 'edit',
    });
    const leaf = edit!.componentDefinitions[0];
    assert.deepEqual(leaf.model?.config?.value, expectedRows);
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

  it('constructs checkbox detail templates from authored defaults even when the parent has saved rows', async () => {
    const field = definition();
    const fieldConfig = field.component.config!;
    fieldConfig.detailFields![0].model!.config!.defaultValue = '@volume-default';
    fieldConfig.detailFieldsByValue![other][0].model!.config!.defaultValue = 'Format notes';
    fieldConfig.detailFields!.push({
      name: 'optional',
      component: { class: 'SimpleInputComponent' },
    });
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
    const formats = [row('table', { volume: 'Saved estimate' }), row(other)];
    const form = await new ConstructFormConfigVisitor(consoleLogger).start({
      data,
      formMode: 'edit',
      record: { formats, projects: [{ formats }] },
      translate: key => key === '@volume-default' ? '10 GB' : key,
    });
    const edit = await new ClientFormConfigVisitor(consoleLogger).start({ form, formMode: 'edit' });
    const [top, repeated] = edit!.componentDefinitions;
    assert.deepEqual(top.model?.config?.value, formats);
    assert.deepEqual(repeated.model?.config?.value, [{ formats }]);
    const repeatedField = (repeated as {
      component: { config: { elementTemplate: { component: { config: { componentDefinitions: typeof top[] } } } } };
    }).component.config.elementTemplate.component.config.componentDefinitions[0];
    for (const item of [top, repeatedField]) {
      const config = item.component.config as typeof fieldConfig;
      assert.deepEqual(config.detailFields!.map(child => child.model?.config?.value), ['10 GB', null]);
      assert.equal(config.detailFieldsByValue![other][0].model?.config?.value, 'Format notes');
    }
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
    const validate = async (projects: unknown[], prior = previousMetadata) => {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data, record: { projects } });
      return new ValidatorFormConfigVisitor(consoleLogger).start({
        form,
        previousMetadata: prior,
        enabledValidationGroups: ['none'],
      });
    };
    assert.deepEqual(await validate(previousMetadata.projects), []);
    assert.deepEqual(await validate([second, third]), []);
    assert.deepEqual(await validate([third, first, second]), []);
    const renamed = { ...second, name: 'Renamed second' };
    assert.deepEqual(await validate([renamed]), []);
    assert.deepEqual(await validate([renamed, first]), []);
    assert.deepEqual(await validate([{ ...first, name: 'Renamed ordinary row' }]), []);
    for (const projects of [
      [second, second],
      [renamed, second],
      [renamed, { ...renamed, name: 'Copy' }],
      [{ ...renamed, formats: [row('archived', { volume: 'Changed while moving' })] }],
      [{ ...renamed, formats: [], otherFormats: [archived] }],
      [{ ...first, formats: [archived] }, second],
      [first, { ...second, otherFormats: [archived] }, third],
      [first, { ...second, formats: [row('archived', { volume: '2 TB' })] }, third],
    ]) {
      const errors = await validate(projects);
      assert.ok(errors.length > 0);
      assert.ok(errors.every(error => /checkbox-details-(option|field)/.test(error.errors[0].message)));
    }
    const sharedArchives = { projects: [{ ...first, formats: [archived] }, second] };
    const editedInPlace = sharedArchives.projects.map(project => ({ ...project, name: project.name + ' updated' }));
    assert.deepEqual(await validate(editedInPlace, sharedArchives), []);
    assert.ok((await validate([...editedInPlace, { ...renamed, name: 'Extra' }], sharedArchives)).length > 0);
    const ambiguous = await validate([renamed], {
      projects: [first, second, { ...third, formats: [archived] }],
    });
    assert.equal(ambiguous[0].errors[0].message, '@validator-error-checkbox-details-option');

    const opaque = await validate([renamed], {
      projects: [first, { ...second, formats: [], arbitrary: [archived] } as typeof second, third],
    });
    assert.equal(opaque[0].errors[0].message, '@validator-error-checkbox-details-option');

    const currentChoice = row('table', { volume: '2 TB', oldNote: 'Older table estimate' });
    const selectable = await validate([{ ...renamed, formats: [currentChoice] }], {
      projects: [first, { ...second, formats: [currentChoice] }, third],
    });
    assert.equal(selectable[0].errors[0].message, '@validator-error-checkbox-details-field');
  });

  it('keeps archived selections scoped to the matched parent in nested repeatables', async () => {
    const repeatable = (name: string, children: FormConfigFrame['componentDefinitions']): FormConfigFrame['componentDefinitions'][number] => ({
      name,
      component: { class: 'RepeatableComponent', config: { elementTemplate: {
        name: '', component: { class: 'GroupComponent', config: { componentDefinitions: children } },
      } } },
    });
    const data: FormConfigFrame = {
      name: 'nested-formats',
      componentDefinitions: [repeatable('projects', [repeatable('collections', [definition()])])],
    };
    const saved = { formats: [row('removed', { notes: 'Original' })] };
    const empty = { formats: [] };
    const first = { name: 'First', collections: [empty] };
    const second = { name: 'Second', collections: [empty, saved] };
    const validate = async (
      projects: readonly (typeof second)[],
      previousMetadata: { projects: readonly (typeof second)[] } = { projects: [first, second] }
    ) => {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data, record: { projects } });
      return new ValidatorFormConfigVisitor(consoleLogger).start({
        form, previousMetadata, enabledValidationGroups: ['none'],
      });
    };
    assert.deepEqual(await validate([first, { ...second, collections: [saved] }]), []);
    const moved = { ...second, name: 'Second renamed', collections: [saved] };
    assert.deepEqual(await validate([moved]), []);
    assert.deepEqual(await validate([moved, first]), []);
    const rejected: [(typeof second)[], { projects: (typeof second)[] }?][] = [
      [[{ ...first, collections: [saved] }, second]],
      [[{ ...moved, collections: [{ formats: [row('removed', { notes: 'Changed' })] }] }]],
      [[moved, { ...moved, name: 'Copied' }]],
      [[{ ...moved, collections: [saved, saved] }]],
      [[moved], { projects: [first, second, { ...second, name: 'Third' }] }],
    ];
    for (const [projects, prior] of rejected) {
      assert.ok((await validate(projects, prior)).some(error =>
        error.errors[0].message === '@validator-error-checkbox-details-option'));
    }
    const copied = await validate([{ ...first, collections: [saved] }, second]);
    assert.deepEqual(copied[0].lineagePaths?.dataModel, ['projects', 0, 'collections', 0, 'formats', 0, 'value']);
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

  it('requires an unresolved lookup when only a named child validation group is active', async () => {
    const field = definition();
    delete field.component.config!.options;
    field.component.config!.vocabRef = 'formats';
    field.component.config!.detailFields![0].model!.config!.validators![0].groups = { include: ['release'] };
    field.model!.config!.validators = [];
    const data = frame(field);
    data.validationGroups = { release: { description: 'Validate estimates', initialMembership: 'none' } };
    const metadata = { formats: [row('table')] };
    const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data, record: metadata });
    const validate = (group: string) => new ValidatorFormConfigVisitor(consoleLogger).start({
      form,
      enabledValidationGroups: [group],
      previousMetadata: metadata,
      validatorDefinitions: formValidatorsSharedDefinitions,
    });
    assert.deepEqual(await validate('none'), []);
    const errors = await validate('release');
    assert.equal(errors[0].errors[0].message, '@validator-error-checkbox-details-lookup-unavailable');
  });

  it('preserves stored answers independently for two groups sharing an unavailable vocabulary', async () => {
    const field = definition();
    delete field.component.config!.options;
    field.component.config!.vocabRef = 'formats';
    const data = frame(field);
    data.componentDefinitions.push({ ...structuredClone(field), name: 'otherFormats' });
    const previousMetadata = { formats: [row('table', { volume: '2 TB' })], otherFormats: [row(other)] };
    const validate = async (otherFormats: typeof previousMetadata.otherFormats) => {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data, record: { formats: [], otherFormats } });
      return new ValidatorFormConfigVisitor(consoleLogger).start({ form, previousMetadata, enabledValidationGroups: ['none'] });
    };
    assert.deepEqual(await validate(previousMetadata.otherFormats), []);
    const borrowed = await validate(previousMetadata.formats);
    assert.equal(borrowed[0].errors[0].message, '@validator-error-checkbox-details-option');
    assert.deepEqual(borrowed[0].lineagePaths?.dataModel, ['otherFormats', 0, 'value']);
  });

  it('preserves retired data from the stored record and rejects new unavailable codes and duplicate rows', async () => {
    const archival = row('removed', { volume: '1 TB', notes: 'Before retirement', blank: null });
    const validate = async (formats: unknown, previousMetadata?: Record<string, unknown>) => {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(), record: { formats } });
      return new ValidatorFormConfigVisitor(consoleLogger).start({
        form,
        enabledValidationGroups: ['none'],
        previousMetadata,
      });
    };
    const stored = { formats: [archival] };
    assert.deepEqual(await validate([archival], stored), []);
    assert.deepEqual(await validate([], stored), []);
    for (const [details, field] of [
      [{ volume: '1 TB', blank: null }, 'notes'],
      [{ volume: '1 TB', notes: 'Before retirement' }, 'blank'],
      [{ ...archival.details, volume: '2 TB' }, 'volume'],
      [{ ...archival.details, another: 'New answer' }, 'another'],
    ] as const) {
      const errors = await validate([row('removed', details)], stored);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].errors[0].message, '@validator-error-checkbox-details-field');
      assert.deepEqual(errors[0].lineagePaths?.dataModel, ['formats', 0, 'details', field]);
    }
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

  it('protects obsolete details while allowing configured details and whole selections to be removed', async () => {
    for (const historical of [false, true]) {
      const field = definition();
      field.component.config!.options![0].historical = historical;
      const previousMetadata = { formats: [row('table', { volume: '1 TB', originalNote: null })] };
      const validate = async (formats: ReturnType<typeof row>[]) => {
        const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(field), record: { formats } });
        return new ValidatorFormConfigVisitor(consoleLogger).start({ form, previousMetadata, enabledValidationGroups: ['none'] });
      };
      assert.deepEqual(await validate([row('table', { originalNote: null })]), []);
      assert.deepEqual(await validate([]), []);
      for (const submitted of [row('table', { volume: '2 TB' }), row('table', { volume: '2 TB', originalNote: 'Changed' })]) {
        const issues = await validate([submitted]);
        assert.equal(issues.length, 1);
        assert.deepEqual(issues[0].lineagePaths?.dataModel, ['formats', 0, 'details', 'originalNote']);
      }
    }
  });

  it('preserves disabled detail answers on retained rows while allowing edits and removals', async () => {
    for (const disabledOn of ['model', 'component', 'layout'] as const) {
      const field = definition();
      const detail = field.component.config!.detailFields![0];
      detail[disabledOn]!.config = { ...detail[disabledOn]!.config, disabled: true };
      const validate = async (formats: ReturnType<typeof row>[], previous = { volume: 'Saved' } as Record<string, string | null>) => {
        const form = await new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(field), record: { formats } });
        return new ValidatorFormConfigVisitor(consoleLogger).start({
          form, previousMetadata: { formats: [row(other, previous)] }, enabledValidationGroups: ['none'],
        });
      };
      assert.deepEqual(await validate([row(other, { volume: 'Saved', description: 'Updated' })]), []);
      assert.deepEqual(await validate([]), []);
      assert.deepEqual(await validate([row('table', { volume: 'New selection default' })]), []);
      assert.deepEqual(await validate([row(other, { volume: null })], {}), []);
      for (const submitted of [
        row(other, { description: 'Omitted' }), row(other, { volume: 'Changed' }), row(other, { volume: null }),
      ]) {
        const errors = await validate([submitted]);
        assert.deepEqual(errors.map(issue => issue.lineagePaths?.dataModel), [['formats', 0, 'details', 'volume']]);
      }
      assert.equal((await validate([row(other)], { volume: null })).length, 1);
      assert.equal((await validate([row(other, { volume: 'Added' })], {})).length, 1);
    }
  });

  it('expands context in default details while preserving codes and stored data at each scope', async () => {
    const code = 'CURRENT_ACTOR';
    const formats = [row(code, { volume: code })];
    const expected = [row(code, { volume: 'Alice' })];
    const field = definition();
    field.component.config!.options = [{ value: code, label: 'Other' }];
    field.component.config!.detailFieldsByValue = {};
    field.component.config!.detailFields![0].model!.config!.defaultValue = code;
    field.model!.config!.defaultValue = formats;
    const groupField: FormConfigFrame['componentDefinitions'][number] = { name: 'group', component: { class: 'GroupComponent',
      config: { componentDefinitions: [structuredClone(field)] } } };
    const repeatableField: FormConfigFrame['componentDefinitions'][number] = {
      name: 'projects', component: { class: 'RepeatableComponent', config: { elementTemplate: {
        name: '', component: { class: 'GroupComponent', config: { componentDefinitions: [
          { ...structuredClone(field), model: { class: 'CheckboxWithDetailsModel' } },
        ] } }, model: { class: 'GroupModel', config: { newEntryValue: { formats } } },
      } } }, model: { class: 'RepeatableModel', config: { defaultValue: [{ formats }] } },
    };
    const data: FormConfigFrame = { name: 'context-defaults', componentDefinitions: [
      field, groupField, repeatableField,
    ] };
    const record = { formats, group: { formats }, projects: [{ formats }] };
    for (const saved of [false, true]) {
      const form = await new ConstructFormConfigVisitor(consoleLogger).start({
        data, record: saved ? record : null, formMode: 'edit',
      });
      await new ContextVariablesFormConfigVisitor(consoleLogger).applyContextVariables(form, { [code]: 'Alice' }, !saved);
      const [root, group, projects] = form.componentDefinitions;
      const rootConfig = root.component.config as typeof field.component.config;
      const nested = (group.component.config as { componentDefinitions: typeof form.componentDefinitions }).componentDefinitions[0];
      assert.deepEqual(root.model?.config?.value, saved ? formats : expected);
      assert.deepEqual(nested.model?.config?.value, saved ? formats : expected);
      assert.deepEqual(projects.model?.config?.value, [{ formats: saved ? formats : expected }]);
      const template = (projects as RepeatableFormComponentDefinitionOutline).component.config?.elementTemplate;
      assert.deepEqual(template?.model?.config?.newEntryValue, { formats: expected });
      assert.equal(rootConfig?.detailFields?.[0].model?.config?.value, 'Alice');
    }
  });

  it('warns about a stale external mapping, keeps unrelated forms usable and preserves archival details', async () => {
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
      const construct = (formMode: 'edit' | 'view', metadata: Record<string, unknown> | null) =>
        new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(field), formMode, record: metadata });
      const warnings: unknown[] = [];
      const resolve = (form: Awaited<ReturnType<typeof construct>>) =>
        new VocabInlineFormConfigVisitor({ ...consoleLogger, warn: message => warnings.push(message) })
          .resolveVocabs(form, 'default');
      for (const metadata of [null, { otherFormats: formats }, { formats: [row('table', { volume: '2 TB' })] }]) {
        const unrelated = await construct('edit', metadata);
        await resolve(unrelated);
        assert.deepEqual(
          await new ValidatorFormConfigVisitor(consoleLogger).start({
            form: unrelated,
            enabledValidationGroups: ['none'],
          }),
          []
        );
      }
      assert.equal(warnings.length, 3);
      assert.match(String(warnings[0]), /vocabulary 'formats' has no entries for detail mappings/);

      const source = await construct('edit', record);
      await resolve(source);
      const validation = await new ValidatorFormConfigVisitor(consoleLogger).start({
        form: source,
        previousMetadata: record,
        enabledValidationGroups: ['all'],
        validatorDefinitions: formValidatorsSharedDefinitions,
      });
      assert.deepEqual(validation, []);
      const untrusted = await new ValidatorFormConfigVisitor(consoleLogger).start({
        form: source,
        enabledValidationGroups: ['none'],
      });
      assert.equal(untrusted[0].errors[0].message, '@validator-error-checkbox-details-option');
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
      record: { formats: [
        row('retired', { volume: '1 TB', oldNote: 'Original notes', hiddenNote: 'Hidden answer' }),
        row('table', { volume: '2 TB', oldNote: 'Previous estimate', hiddenNote: 'Hidden current answer' }),
      ] },
    });
    const view = await new ClientFormConfigVisitor(consoleLogger).start({ form, formMode: 'view' });
    const output = view!.componentDefinitions[0].component.config as { content: unknown; template: string };
    const translationService = { t: (key: string) => (key === '@old-format' ? 'Retired format label' : key) };
    const rendered = handlebarsCompile(output.template)({ content: output.content, translationService });
    assert.match(rendered, /Retired format label.*Volume.*1 TB.*oldNote.*Original notes/s);
    assert.match(rendered, /Tabulated files.*Volume.*2 TB.*oldNote.*Previous estimate/s);
    assert.doesNotMatch(rendered, /Hidden (?:current )?answer/);
  });

  it('checks static mappings and validates the option list from a deferred vocabulary', async () => {
    const construct = (field: CheckboxWithDetailsFormComponentDefinitionFrame) =>
      new ConstructFormConfigVisitor(consoleLogger).start({ data: frame(field) });
    const field = definition();
    field.component.config!.detailFieldsByValue![other][0].name = 'volume';
    await assert.rejects(construct(field), /duplicate checkbox detail field name/);
    const staleStaticMapping = definition();
    staleStaticMapping.component.config!.options!.pop();
    const warnings: unknown[] = [];
    const logger = { ...consoleLogger, warn: (message: unknown) => warnings.push(message) };
    await new ConstructFormConfigVisitor(logger).start({ data: frame(staleStaticMapping) });
    assert.equal(warnings.length, 1);
    assert.ok(String(warnings[0]).includes(other));

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
      mockEntries.push({ ...mockEntries[0] });
      await assert.rejects(
        new VocabInlineFormConfigVisitor(consoleLogger).resolveVocabs(form, 'default', {
          resolveDeferredCheckboxDetails: true,
        }),
        /unique nonempty string values/
      );
    } finally {
      if (service) Object.defineProperty(globalThis, 'VocabularyService', service);
      else Reflect.deleteProperty(globalThis, 'VocabularyService');
    }
  });
  it('resolves deferred checkbox choices inside a QuestionTree without inlining sibling lookups', async () => {
    const field = definition();
    delete field.component.config!.options;
    field.component.config!.vocabRef = 'formats';
    const record = { tree: { formats: [row('table', { volume: '1 TB' })] } };
    const constructor = new ConstructFormConfigVisitor(consoleLogger);
    const form = await constructor.start({ data: {
      name: 'tree-with-formats',
      componentDefinitions: [{ name: 'tree', component: { class: 'QuestionTreeComponent' } }],
    }, record, formMode: 'edit' });
    const children = (form.componentDefinitions[0] as QuestionTreeFormComponentDefinitionOutline)
      .component.config!.componentDefinitions!;
    // QuestionTree emits its own constructed definitions; exercise its normal visitor dispatch.
    const nested = await constructor.start({ data: { name: 'tree-child', componentDefinitions: [field, {
      name: 'legacy', component: { class: 'DropdownInputComponent', config: { vocabRef: 'unrelated', inlineVocab: true } },
    }] }, record: record.tree, formMode: 'edit' });
    children.push(...nested.componentDefinitions);

    const service = Object.getOwnPropertyDescriptor(globalThis, 'VocabularyService');
    const reads: string[] = [];
    try {
      Object.defineProperty(globalThis, 'VocabularyService', { configurable: true, value: {
        getEntries: async (_brand: string, ref: string) => {
          reads.push(ref);
          return { entries: [{ value: 'table', label: 'Tabulated files' }, { value: other, label: 'Other' }] };
        },
      } });
      await new VocabInlineFormConfigVisitor(consoleLogger).resolveVocabs(form, 'default', {
        resolveDeferredCheckboxDetails: true,
      });
      assert.deepEqual(reads, ['formats']);
      assert.deepEqual(await new ValidatorFormConfigVisitor(consoleLogger).start({
        form, validatorDefinitions: formValidatorsSharedDefinitions,
      }), []);
    } finally {
      if (service) Object.defineProperty(globalThis, 'VocabularyService', service);
      else Reflect.deleteProperty(globalThis, 'VocabularyService');
    }
  });

  it('observes a queued lookup rejection before traversal finishes and propagates the failure', async () => {
    const field = definition();
    delete field.component.config!.options;
    field.component.config!.vocabRef = 'formats';
    const form = await new ConstructFormConfigVisitor(consoleLogger).start({ formMode: 'edit', data: {
      name: 'parallel-lookups',
      componentDefinitions: [field, { name: 'later', component: { class: 'TypeaheadInputComponent',
        config: { sourceType: 'namedQuery', queryId: 'later' } } }],
    } });
    let paused = false;
    class PausedTraversal extends VocabInlineFormConfigVisitor {
      override async visitTypeaheadInputFormComponentDefinition(_item: TypeaheadInputFormComponentDefinitionOutline) {
        await new Promise<void>(resolve => setImmediate(() => setImmediate(resolve)));
        paused = true;
      }
    }
    const failure = new Error('Vocabulary read failed');
    const service = Object.getOwnPropertyDescriptor(globalThis, 'VocabularyService');
    const unexpected: unknown[] = [];
    const observe = (error: unknown) => unexpected.push(error);
    process.on('unhandledRejection', observe);
    try {
      Object.defineProperty(globalThis, 'VocabularyService', { configurable: true, value: {
        getEntries: async () => { throw failure; },
      } });
      await assert.rejects(new PausedTraversal(consoleLogger).resolveVocabs(form, 'default', {
        resolveDeferredCheckboxDetails: true,
      }), error => error === failure);
      assert.equal(paused, true);
      assert.deepEqual(unexpected, []);
    } finally {
      process.removeListener('unhandledRejection', observe);
      if (service) Object.defineProperty(globalThis, 'VocabularyService', service);
      else Reflect.deleteProperty(globalThis, 'VocabularyService');
    }
  });
});
