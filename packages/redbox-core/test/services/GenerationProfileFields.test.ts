import { strict as assert } from 'node:assert';
import { QuestionTreeHelper, type FormConfigFrame } from '@researchdatabox/sails-ng-common';
import developmentForm from '../../../redbox-hook-dev/src/form-config/default-1.0-draft';
import { profileFormFields } from '../../src/services/generation/profile-admin-fields';

describe('Drafting profile choice catalogue', () => {
  const translate = (text: string) => 'Translated ' + text;
  const formWith = (component: string, config: Record<string, unknown>): FormConfigFrame => ({
    componentDefinitions: [{ name: 'choice', model: { class: component.replace('Component', 'Model') }, component: { class: component, config } }],
  } as FormConfigFrame);

  for (const name of ['dropdown_1', 'radio_1', 'checkbox_1', 'checkbox_multiple', 'lookahead_1', 'lookahead_require_selection']) {
    it(`extracts all displayed choices from shipped default-1.0-draft ${name}`, () => {
      const form = structuredClone(developmentForm);
      const before = structuredClone(form);
      let config: any;
      const find = (items: any[]) => {
        for (const item of items) {
          if (item.name === name) config = item.component.config;
          for (const key of ['componentDefinitions', 'tabs', 'panels']) find(item.component?.config?.[key] ?? []);
        }
      };
      find(form.componentDefinitions!);
      assert.ok(config);
      const choices = config.staticOptions ?? config.options;
      const field = profileFormFields(form, translate).find(f => f.pointer.endsWith('/' + name))!;
      assert.ok(field);
      assert.deepEqual(field.options, config.valueMode === 'optionObject' ? undefined : choices.map((o: { value: string; label: string }) => ({ value: o.value, label: translate(o.label) })));
      if (name.startsWith('lookahead')) assert.equal(field.output, undefined);
      else assert.equal(field.output?.kind, name === 'checkbox_multiple' ? 'enumArray' : 'enum');
      assert.deepEqual(form, before);
    });
  }

  it('shows field labels as plain text even when tags are nested or split', () => {
    const form = { componentDefinitions: [{ name: 'title', model: { class: 'SimpleInputModel' },
      component: { class: 'SimpleInputComponent', config: {} }, layout: { config: { label: '<scr<script>ipt>Project <b>title</b> >' } } }] } as FormConfigFrame;
    assert.equal(profileFormFields(form, text => text)[0].label, 'Project title');
  });

  for (const component of ['DropdownInputComponent', 'RadioInputComponent', 'CheckboxInputComponent', 'TypeaheadInputComponent']) {
    it(`filters placeholders and translates fixed ${component} choices consistently`, () => {
      const choices = [{ value: '', label: 'Placeholder' }, { value: ' ', label: 'Placeholder' }, null, 'invalid',
        { value: 'code', label: '@choice-label', disabled: true }, { value: 'fallback' }];
      const field = profileFormFields(formWith(component, component === 'TypeaheadInputComponent' ? { staticOptions: choices } : { options: choices }), translate)[0];
      assert.deepEqual(field.options, [{ value: 'code', label: 'Translated @choice-label' }, { value: 'fallback', label: 'Translated fallback' }]);
    });
  }

  for (const config of [{}, { sourceType: 'static' }, { valueMode: 'value' }, { requireSelection: false }]) {
    it(`extracts scalar static typeahead choices with defaults ${JSON.stringify(config)}`, () => {
      const field = profileFormFields(formWith('TypeaheadInputComponent', { ...config, staticOptions: [{ value: 'code', label: 'Meaning' }] }), translate)[0];
      assert.deepEqual(field.options, [{ value: 'code', label: 'Translated Meaning' }]);
      assert.equal(field.output, undefined);
    });
  }

  for (const config of [{ valueMode: 'optionObject' }, ...['vocabulary', 'external', 'service', 'namedQuery'].map(sourceType => ({ sourceType }))]) {
    it(`does not map static typeahead choices onto other stored values ${JSON.stringify(config)}`, () => {
      const field = profileFormFields(formWith('TypeaheadInputComponent', { ...config, staticOptions: [{ value: 'code', label: 'Meaning' }] }), translate)[0];
      assert.equal(field.options, undefined);
      assert.equal(field.output, undefined);
    });
  }

  for (const answersMax of [1, 2]) it(`extracts question-tree choices from its effective ${answersMax === 1 ? 'radio' : 'checkbox'} child`, () => {
    const question: any = { id: 'decision', answersMin: 1, answersMax, answers: [{ value: 'yes', label: 'Yes meaning' }, { value: 'no', label: 'No meaning' }], rules: { op: 'true' } };
    const helper = new QuestionTreeHelper({} as any);
    const child = helper.transformQuestionConfig('tree', { angularComponentsJsonPointer: '/tree' } as any,
      { class: 'QuestionTreeComponent' }, {}, question.id, [question]);
    // Runtime reusable expansion supplies the model and replaces the answer name.
    const answer: any = child.component.config!.componentDefinitions![0];
    answer.name = question.id;
    answer.model = { class: answersMax === 1 ? 'RadioInputModel' : 'CheckboxInputModel' };
    const form = formWith('QuestionTreeComponent', { componentDefinitions: [child] });
    const fields = profileFormFields(form, translate);
    assert.equal(fields.length, 1);
    assert.deepEqual(fields[0].options, [{ value: 'yes', label: 'Translated Yes meaning' }, { value: 'no', label: 'Translated No meaning' }]);
    assert.equal(fields[0].output?.kind, answersMax === 1 ? 'enum' : 'enumArray');
  });

  it('keeps boolean checkbox semantics and does not invent string choices for structured controls', () => {
    const checkbox = profileFormFields(formWith('CheckboxInputComponent', { booleanMode: true }), translate)[0];
    assert.deepEqual(checkbox.output, { kind: 'boolean' });
    assert.equal(checkbox.options, undefined);
    // Trees persist selected objects including labels; data locations persist
    // objects with separate type/classification properties, not scalar codes.
    for (const [component, config] of [
      ['CheckboxTreeComponent', { treeData: [{ id: 'id', value: 'code', label: 'Meaning' }] }],
      ['DataLocationComponent', { dataTypes: [{ value: 'url', label: 'URL' }], securityClassificationOptions: [{ value: 'internal', label: 'Internal' }] }],
    ] as const) {
      const field = profileFormFields(formWith(component, config), translate)[0];
      assert.ok(field);
      assert.equal(field.options, undefined);
      assert.equal(field.output, undefined);
    }
  });
});
