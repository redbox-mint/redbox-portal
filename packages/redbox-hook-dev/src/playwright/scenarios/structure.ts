import type { FormConfigFrame, RepeatableFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';
import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

export function structureForm(names: ScenarioNames, id: string): FormConfigFrame {
  const fields: FormConfigFrame['componentDefinitions'] = [textField('title', 'Title', 'Structured record')];
  if (id === 'structure-tabs-accordions') {
    fields.push(
      { name: 'tabs', layout: { class: 'TabLayout' }, component: { class: 'TabComponent', config: { tabs: [
        { name: 'overview', layout: { class: 'TabContentLayout', config: { buttonLabel: 'Overview' } }, component: { class: 'TabContentComponent', config: { selected: true, componentDefinitions: [textField('overview', 'Overview value', 'Initial overview')] } } },
        { name: 'details', layout: { class: 'TabContentLayout', config: { buttonLabel: 'Details' } }, component: { class: 'TabContentComponent', config: { componentDefinitions: [textField('details', 'Details value', 'Initial details')] } } },
      ] } } },
      { name: 'panels', layout: { class: 'AccordionLayout' }, component: { class: 'AccordionComponent', config: { startingOpenMode: 'first-open', panels: [
        { name: 'first', layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'First panel' } }, component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [textField('first', 'First panel value', 'Initial first')] } } },
        { name: 'second', layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'Second panel' } }, component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [textField('second', 'Second panel value', 'Initial second')] } } },
      ] } } },
    );
  } else if (id === 'structure-nested-repeatables') {
    const members: RepeatableFormComponentDefinitionFrame = {
      name: 'members', component: { class: 'RepeatableComponent', config: { allowZeroRows: true, addButtonShow: true,
        elementTemplate: { name: '', layout: { class: 'RepeatableElementLayout', config: { label: 'Member' } },
          model: { class: 'GroupModel', config: { newEntryValue: { name: '', email: '' } } },
          component: { class: 'GroupComponent', config: { componentDefinitions: [textField('name', 'Member name'), textField('email', 'Member email')] } },
        },
      } }, model: { class: 'RepeatableModel' },
    };
    fields.push({ name: 'teams', model: { class: 'RepeatableModel', config: { defaultValue: [
      { name: 'Alpha', members: [{ name: 'Alice', email: 'alice@example.test' }, { name: 'Anne', email: 'anne@example.test' }] },
      { name: 'Beta', members: [{ name: 'Bob', email: 'bob@example.test' }] },
    ] } }, component: { class: 'RepeatableComponent', config: { allowZeroRows: true, addButtonShow: true,
      elementTemplate: { name: '', layout: { class: 'RepeatableElementLayout', config: { label: 'Team' } },
        model: { class: 'GroupModel', config: { newEntryValue: { name: '', members: [] } } },
        component: { class: 'GroupComponent', config: { componentDefinitions: [textField('name', 'Team name'), members] } },
      },
    } } });
  } else {
    fields.push({ name: 'decision', model: { class: 'QuestionTreeModel', config: { defaultValue: { branch: 'alpha', alpha: 'open' } } },
      component: { class: 'QuestionTreeComponent', config: { componentDefinitions: [],
        availableOutcomes: [{ value: 'open', label: 'Open access' }, { value: 'restricted', label: 'Restricted access' }],
        questions: [
          { id: 'branch', label: 'Choose a branch', answersMin: 1, answersMax: 1, rules: { op: 'true' }, answers: [{ value: 'alpha', label: 'Alpha branch' }, { value: 'beta', label: 'Beta branch' }] },
          { id: 'alpha', label: 'Alpha access', answersMin: 1, answersMax: 1, rules: { op: 'in', q: 'branch', a: ['alpha'] }, answers: [{ value: 'open', label: 'Alpha open', outcome: 'open' }, { value: 'restricted', label: 'Alpha restricted', outcome: 'restricted' }] },
          { id: 'beta', label: 'Beta access', answersMin: 1, answersMax: 1, rules: { op: 'in', q: 'branch', a: ['beta'] }, answers: [{ value: 'open', label: 'Beta open', outcome: 'open' }, { value: 'restricted', label: 'Beta restricted', outcome: 'restricted' }] },
          { id: 'reason', label: 'Restriction reason', answersMin: 1, answersMax: 1, rules: { op: 'in', q: 'beta', a: ['restricted'] }, answers: [{ value: 'consent', label: 'Participant consent', outcome: 'restricted' }, { value: 'contract', label: 'Contract restriction', outcome: 'restricted' }] },
        ],
      } },
    });
  }
  return scenarioForm(names, fields);
}
