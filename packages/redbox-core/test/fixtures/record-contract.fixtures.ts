import type {
  FormComponentDefinitionFrame,
  FormConfigFrame,
  ReusableFormDefinitions,
} from '@researchdatabox/sails-ng-common';

export interface RecordContractFormFixture extends Omit<FormConfigFrame, 'componentDefinitions'> {
  componentDefinitions: FormComponentDefinitionFrame[];
}

export interface RecordContractVocabularyFixture {
  readonly id: string;
  readonly entries: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
}

export interface RecordContractFixture {
  readonly form: RecordContractFormFixture;
  readonly reusableFormDefinitions: ReusableFormDefinitions;
  readonly vocabularies: Readonly<Record<string, RecordContractVocabularyFixture>>;
  readonly expectedShapeByPointer: Readonly<Record<string, string>>;
}

function customComponentFixture(): FormComponentDefinitionFrame {
  // Hook components are intentionally outside core's closed component union.
  return {
    name: 'custom_hook_value',
    module: '@example/redbox-hook-contract-fixture',
    component: { class: 'ExampleHookComponent' },
    model: {
      class: 'ExampleHookModel',
      config: {},
    },
  };
}

/**
 * Builds a detached, local-only form fixture shared by record-contract tests.
 * No field, vocabulary, or extension value depends on the clock, network, or
 * process state.
 */
export function createRecordContractFixture(): RecordContractFixture {
  const reusableFormDefinitions: ReusableFormDefinitions = {
    'contact-details-v1': [
      {
        name: 'contact_email',
        component: {
          class: 'SimpleInputComponent',
          config: { type: 'email', label: 'Contact email' },
        },
        model: {
          class: 'SimpleInputModel',
          config: {
            validators: [{ class: 'email', groups: { include: ['submit'] } }],
          },
        },
      },
    ],
  };

  const coreForm: FormConfigFrame = {
    name: 'record-contract-fixture-1.0-draft',
    type: 'record-contract-fixture',
    enabledValidationGroups: ['draft'],
    validationGroups: {
      all: { description: 'All validators', initialMembership: 'all' },
      draft: { description: 'Draft validation', initialMembership: 'none' },
      submit: { description: 'Submission validation', initialMembership: 'none' },
    },
    validationOperations: {
      draft: {
        label: 'Save draft',
        enabledValidationGroups: ['draft'],
        roles: ['Researcher'],
      },
      submit: {
        label: 'Submit',
        enabledValidationGroups: ['submit'],
        roles: ['Researcher', 'Librarian'],
        allowedTargetSteps: ['review'],
      },
    },
    validators: [
      {
        class: 'jsonata-expression',
        config: { expression: '$exists(title)' },
        groups: { include: ['submit'] },
        targetField: { dataModel: ['title'] },
      },
    ],
    componentDefinitions: [
      {
        name: 'fixture_heading',
        component: {
          class: 'ContentComponent',
          config: { content: 'Record contract fixture' },
        },
      },
      {
        name: 'title',
        component: {
          class: 'SimpleInputComponent',
          config: { type: 'text', label: 'Title' },
        },
        model: {
          class: 'SimpleInputModel',
          config: {
            defaultValue: 'Deterministic title',
            validators: [
              { class: 'required', groups: { include: ['submit'] } },
              { class: 'maxLength', config: { maxLength: 256 }, groups: { include: ['draft', 'submit'] } },
            ],
          },
        },
      },
      {
        name: 'amount',
        component: {
          class: 'SimpleInputComponent',
          config: { type: 'number', label: 'Amount' },
        },
        model: { class: 'SimpleInputModel', config: {} },
      },
      {
        name: 'count',
        component: {
          class: 'SimpleInputComponent',
          config: { type: 'number', label: 'Count' },
        },
        model: {
          class: 'SimpleInputModel',
          config: { validators: [{ class: 'integer' }] },
        },
      },
      {
        name: 'is_public',
        component: {
          class: 'CheckboxInputComponent',
          config: { booleanMode: true, label: 'Public' },
        },
        model: { class: 'CheckboxInputModel', config: { defaultValue: false } },
      },
      {
        name: 'nullable_status',
        component: {
          class: 'DropdownInputComponent',
          config: {
            label: 'Status',
            options: [
              { value: 'draft', label: 'Draft' },
              { value: 'final', label: 'Final' },
            ],
          },
        },
        model: { class: 'DropdownInputModel', config: { defaultValue: null } },
      },
      {
        name: 'fixed_choice',
        component: {
          class: 'DropdownInputComponent',
          config: {
            label: 'Fixed choice',
            options: [
              { value: 'alpha', label: 'Alpha' },
              { value: 'beta', label: 'Beta' },
            ],
          },
        },
        model: { class: 'DropdownInputModel', config: {} },
      },
      {
        name: 'vocabulary_choice',
        component: {
          class: 'DropdownInputComponent',
          config: { label: 'Vocabulary choice', vocabRef: 'fixture-vocabulary', inlineVocab: true },
        },
        model: { class: 'DropdownInputModel', config: {} },
      },
      {
        name: 'details',
        component: {
          class: 'GroupComponent',
          config: {
            componentDefinitions: [
              {
                name: 'description',
                component: {
                  class: 'TextAreaComponent',
                  config: { label: 'Description', rows: 5, cols: 80 },
                },
                model: { class: 'TextAreaModel', config: {} },
              },
              {
                name: 'role_only_note',
                constraints: { authorization: { allowRoles: ['Librarian'] } },
                component: { class: 'SimpleInputComponent', config: { type: 'text' } },
                model: { class: 'SimpleInputModel', config: {} },
              },
              {
                name: 'edit_only_note',
                constraints: { allowModes: ['edit'] },
                component: { class: 'SimpleInputComponent', config: { type: 'text' } },
                model: { class: 'SimpleInputModel', config: {} },
              },
            ],
          },
        },
        model: { class: 'GroupModel', config: {} },
      },
      {
        name: 'contributors',
        component: {
          class: 'RepeatableComponent',
          config: {
            allowZeroRows: true,
            elementTemplate: {
              name: 'contributor',
              component: {
                class: 'GroupComponent',
                config: {
                  componentDefinitions: [
                    {
                      name: 'name',
                      component: { class: 'SimpleInputComponent', config: { type: 'text' } },
                      model: { class: 'SimpleInputModel', config: {} },
                    },
                  ],
                },
              },
              model: { class: 'GroupModel', config: {} },
            },
          },
        },
        model: { class: 'RepeatableModel', config: { defaultValue: [] } },
      },
      {
        name: 'contact',
        overrides: { reusableFormName: 'contact-details-v1' },
        component: { class: 'ReusableComponent', config: { componentDefinitions: [] } },
      },
      {
        name: 'access_questions',
        component: {
          class: 'QuestionTreeComponent',
          config: {
            availableOutcomes: [
              { value: 'open', label: 'Open' },
              { value: 'restricted', label: 'Restricted' },
            ],
            questions: [
              {
                id: 'sensitive',
                label: 'Sensitive data?',
                answersMin: 1,
                answersMax: 1,
                answers: [
                  { value: 'no', label: 'No', outcome: 'open' },
                  { value: 'yes', label: 'Yes', outcome: 'restricted' },
                ],
                rules: { op: 'true' },
              },
              {
                id: 'consent',
                label: 'Consent obtained?',
                answersMin: 1,
                answersMax: 1,
                answers: [
                  { value: 'yes', label: 'Yes', outcome: 'open' },
                  { value: 'no', label: 'No', outcome: 'restricted' },
                ],
                rules: { op: 'in', q: 'sensitive', a: ['yes'] },
              },
            ],
            componentDefinitions: [
              {
                name: 'restricted_reason',
                component: { class: 'SimpleInputComponent', config: { type: 'text' } },
                model: { class: 'SimpleInputModel', config: {} },
              },
            ],
          },
        },
        model: { class: 'QuestionTreeModel', config: {} },
      },
      {
        name: 'geographic_coverage',
        component: { class: 'MapComponent', config: { center: [-24.67, 134.07], zoom: 4 } },
        model: {
          class: 'MapModel',
          config: { defaultValue: { type: 'FeatureCollection', features: [] } },
        },
      },
      {
        name: 'attachments',
        component: { class: 'FileUploadComponent', config: { allowUploadWithoutSave: true } },
        model: { class: 'FileUploadModel', config: { defaultValue: [] } },
      },
      {
        name: 'static_typeahead',
        component: {
          class: 'TypeaheadInputComponent',
          config: {
            sourceType: 'static',
            staticOptions: [
              { label: 'One', value: 'one' },
              { label: 'Two', value: 'two' },
            ],
            requireSelection: true,
          },
        },
        model: { class: 'TypeaheadInputModel', config: {} },
      },
      {
        name: 'data_locations',
        component: { class: 'DataLocationComponent', config: { notesEnabled: true } },
        model: { class: 'DataLocationModel', config: { defaultValue: [] } },
      },
    ],
  };
  const form: RecordContractFormFixture = {
    ...coreForm,
    componentDefinitions: [...coreForm.componentDefinitions, customComponentFixture()],
  };

  return structuredClone({
    form,
    reusableFormDefinitions,
    vocabularies: {
      'fixture-vocabulary': {
        id: 'fixture-vocabulary',
        entries: [
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ],
      },
    },
    expectedShapeByPointer: {
      '/title': 'string',
      '/amount': 'number',
      '/count': 'integer',
      '/is_public': 'boolean',
      '/nullable_status': 'string|null',
      '/details': 'object',
      '/contributors': 'array',
      '/fixed_choice': 'enum',
      '/access_questions': 'conditional-object',
      '/geographic_coverage': 'geojson-object',
      '/attachments': 'attachment-array',
      '/static_typeahead': 'string',
      '/data_locations': 'data-location-array',
      '/custom_hook_value': 'custom',
      '/example:contract-extension': 'namespaced-extension',
    },
  });
}
