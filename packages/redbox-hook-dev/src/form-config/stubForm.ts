import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

export function createStubFormConfig(name: string, type: string): FormConfigFrame {
  return {
    name,
    type,
    domElementType: 'form',
    defaultComponentConfig: {
      defaultComponentCssClasses: 'row',
    },
    editCssClasses: 'redbox-form form',
    componentDefinitions: [
      {
        name: 'title',
        layout: {
          class: 'DefaultLayout',
          config: {
            label: '@title',
          },
        },
        model: {
          class: 'SimpleInputModel',
          config: {
            validators: [{ class: 'required' }],
          },
        },
        component: {
          class: 'SimpleInputComponent',
        },
      },
    ],
  };
}
