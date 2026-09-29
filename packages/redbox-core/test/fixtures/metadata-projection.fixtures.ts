import type { FormConfigFrame, SimpleInputFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

export const dataRecordProjectionForm: FormConfigFrame = {
  name: 'data-record-projection',
  componentDefinitions: [
    {
      name: 'dataLocations',
      component: { class: 'DataLocationComponent', config: { notesEnabled: true } },
      model: { class: 'DataLocationModel', config: { defaultValue: [] } },
    },
    {
      name: 'contributor_data_manager',
      component: {
        class: 'GroupComponent',
        config: {
          componentDefinitions: ['given_name', 'family_name', 'email'].map<SimpleInputFormComponentDefinitionFrame>(
            name => ({
              name,
              component: { class: 'SimpleInputComponent' },
              model: { class: 'SimpleInputModel', config: {} },
            })
          ),
        },
      },
      model: { class: 'GroupModel', config: {} },
    },
  ],
};

export const dataRecordProjectedMetadata = {
  dataLocations: [
    {
      type: 'file',
      location: '/research-data/projects/coastal',
      notes: 'Representative storage location',
      properties: { tier: 'Resilient Research Storage' },
      elements: ['data keys, not schema keywords'],
    },
  ],
  contributor_data_manager: {
    given_name: 'Marcus',
    family_name: 'Bell',
    email: 'marcus@example.test',
  },
};
