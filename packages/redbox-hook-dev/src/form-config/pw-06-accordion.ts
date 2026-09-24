import type { FormConfigFrame, SimpleInputFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

function textField(name: string, label: string, defaultValue: string): SimpleInputFormComponentDefinitionFrame {
  return {
    name,
    layout: { class: 'DefaultLayout', config: { label } },
    component: { class: 'SimpleInputComponent' },
    model: { class: 'SimpleInputModel', config: { defaultValue } },
  };
}

// F16's accordion configuration, isolated from tabs and validation.
const form: FormConfigFrame = {
  name: 'pw-06-accordion-1.0-draft',
  type: 'pw-06-accordion',
  domElementType: 'form',
  componentDefinitions: [
    textField('title', 'Title', 'PW-06 accordion'),
    {
      name: 'panels',
      layout: { class: 'AccordionLayout' },
      component: {
        class: 'AccordionComponent',
        config: {
          startingOpenMode: 'first-open',
          panels: [
            {
              name: 'first',
              layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'First panel' } },
              component: {
                class: 'AccordionPanelComponent',
                config: { componentDefinitions: [textField('first', 'First panel value', 'First stored')] },
              },
            },
            {
              name: 'second',
              layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'Second panel' } },
              component: {
                class: 'AccordionPanelComponent',
                config: { componentDefinitions: [textField('second', 'Second panel value', 'Second stored')] },
              },
            },
          ],
        },
      },
    },
    {
      name: 'save',
      constraints: { allowModes: ['edit'] },
      component: { class: 'SaveButtonComponent', config: { label: 'Save', labelSaving: 'Saving…' } },
    },
    { name: 'saveStatus', component: { class: 'SaveStatusComponent' } },
  ],
};

export default form;
