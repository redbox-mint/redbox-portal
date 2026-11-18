import type {
  FormComponentDefinitionFrame,
  MetadataReadShape,
  SimpleInputFormComponentDefinitionFrame,
  QuestionTreeFormComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';

/** Synthetic names/values retain hidden event carriers and reusable expansion. */
export const contactReadShape: MetadataReadShape = {
  type: 'object',
  properties: { name: { type: 'string' }, email: { type: 'string' }, directoryId: { type: 'string' } },
};
export function carrier(name: string, readShape?: MetadataReadShape): SimpleInputFormComponentDefinitionFrame {
  return {
    name,
    component: { class: 'SimpleInputComponent', config: { type: 'hidden', visible: false } },
    model: { class: 'SimpleInputModel', config: {} },
    layout: { class: 'DefaultLayout', config: { visible: false } },
    expressions: [
      {
        name: 'copy-related',
        config: {
          conditionKind: 'jsonpointer',
          condition: '/related::field.value.changed',
          template: `event.value.${name}`,
          target: 'model.value',
          runOnFormReady: false,
        },
      },
    ],
    ...(readShape ? { readShape } : {}),
  };
}
export function authoringFixture(optIn: boolean) {
  const tree: QuestionTreeFormComponentDefinitionFrame = {
    name: 'questionnaire',
    component: {
      class: 'QuestionTreeComponent',
      config: {
        availableOutcomes: [],
        componentDefinitions: [],
        questions: [
          {
            id: 'published',
            answersMax: 1,
            answersMin: 1,
            answers: [{ value: 'yes', label: 'Yes' }],
            rules: { op: 'true' },
          },
          {
            id: 'personal',
            answersMax: 1,
            answersMin: 1,
            answers: [{ value: 'no', label: 'No' }],
            rules: { op: 'or', args: [{ op: 'in', q: 'published', a: ['yes'] }] },
          },
          {
            id: 'categories',
            answersMax: 2,
            answersMin: 1,
            answers: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ],
            rules: { op: 'true' },
          },
        ],
      },
    },
    model: { class: 'QuestionTreeModel', config: {} },
  };
  const definitions: FormComponentDefinitionFrame[] = [
    carrier('owner', optIn ? contactReadShape : undefined),
    carrier('members', optIn ? { type: 'array', items: contactReadShape } : undefined),
    {
      ...carrier(
        'outcomeDetails',
        optIn
          ? {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  classification: { type: 'string' },
                  metadataTag: { type: 'string' },
                },
              },
            }
          : undefined
      ),
      expressions: [
        {
          name: 'outcomes',
          config: {
            conditionKind: 'jsonpointer',
            condition: '/questionnaire::field.value.changed',
            template:
              'formData.questionnaire.meta.{"classification": outcome.label, "metadataTag": metadataTag.value}[]',
            target: 'model.value',
            runOnFormReady: true,
          },
        },
      ],
    },
    tree,
  ];
  const contact = { name: 'Example Person', email: 'person@example.invalid', directoryId: 'example-1', secret: 'omit' };
  return {
    form: {
      name: 'publication',
      componentDefinitions: [
        { name: 'shared', component: { class: 'ReusableComponent' }, overrides: { reusableFormName: 'carriers' } },
      ],
    },
    reusableFormDefinitions: { carriers: definitions },
    stored: {
      owner: contact,
      members: [contact],
      outcomeDetails: [{ classification: 'Public' }],
      questionnaire: { published: 'yes', personal: 'no', categories: ['a'] },
      unrestricted: 'omit',
    },
  };
}
