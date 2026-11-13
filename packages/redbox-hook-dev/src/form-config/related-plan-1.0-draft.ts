import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

type Component = NonNullable<FormConfigFrame['componentDefinitions']>[number];

const input = (name: string, label: string): Component => ({
  name,
  layout: { class: 'DefaultLayout', config: { label } },
  model: { class: 'SimpleInputModel' },
  component: { class: 'SimpleInputComponent' },
});
const population = (source: string, template: string): NonNullable<Component['expressions']> => [
  {
    name: 'populate',
    config: {
      conditionKind: 'jsonpointer',
      condition: `/${source}::field.value.changed`,
      runOnFormReady: false,
      template,
      target: 'model.value',
    },
  },
  {
    name: 'protect',
    config: {
      conditionKind: 'jsonpointer',
      condition: `/${source}::field.value.changed`,
      runOnFormReady: false,
      template: 'event.value.status != "empty" or event.value.loading = true',
      target: 'field.disabled',
    },
  },
];

const form: FormConfigFrame = {
  name: 'related-plan-1.0-draft',
  type: 'related-plan',
  domElementType: 'form',
  componentDefinitions: [
    input('title', 'Plan title'),
    input('notes', 'Local notes (always stored on this plan)'),
    input('primaryActivity', 'Primary activity OID (clear to unlink)'),
    {
      name: 'activities',
      model: { class: 'RepeatableModel', config: { defaultValue: [] } },
      layout: { class: 'DefaultLayout', config: { label: 'Additional activity references' } },
      component: {
        class: 'RepeatableComponent',
        config: {
          allowZeroRows: true,
          elementTemplate: {
            name: '',
            model: { class: 'GroupModel' },
            component: { class: 'GroupComponent', config: { componentDefinitions: [input('oid', 'Activity OID')] } },
          },
        },
      },
    },
    {
      name: 'activityInformation',
      component: {
        class: 'RelatedObjectDataComponent',
        config: {
          relationId: 'activities',
          required: false,
          template:
            '<h3>Current activities</h3>{{#each relatedObjects}}<p>{{fields.title}}: {{fields.startDate}} – {{fields.endDate}}</p>{{else}}<p>No accessible activities selected.</p>{{/each}}',
        },
      },
    },
    // CSS/layout hidden, never constrained out: both roles and view mode need its events.
    {
      name: 'primarySource',
      layout: { class: 'DefaultLayout', config: { visible: false } },
      component: { class: 'RelatedObjectDataComponent', config: { relationId: 'primaryActivity', required: false } },
    },
    {
      name: 'activitiesSource',
      layout: { class: 'DefaultLayout', config: { visible: false } },
      component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities', required: false } },
    },
    // All role/mode variants share the same metadata path and persistence rule.
    // Admin wins for accounts carrying both roles, so only one control survives.
    ...(['edit', 'view'] as const).flatMap(
      mode =>
        [
          {
            ...input('activityTitle', mode === 'edit' ? 'Current primary activity title' : 'Primary activity'),
            constraints: { allowModes: [mode], authorization: { allowRoles: ['Admin'] } },
            relatedDisplay: { relationId: 'primaryActivity' },
            expressions: population(
              'primarySource',
              'event.value.loading ? "" : ($exists(event.value.records[0].metadata.title) ? event.value.records[0].metadata.title : "")'
            ),
          },
          {
            name: 'activityTitle',
            constraints: { allowModes: [mode], authorization: { allowRoles: ['Librarians'], denyRoles: ['Admin'] } },
            relatedDisplay: { relationId: 'primaryActivity' },
            layout: { class: 'DefaultLayout', config: { label: 'Primary activity summary (read only)' } },
            model: { class: 'TextAreaModel', config: { defaultValue: '' } },
            component: { class: 'TextAreaComponent', config: { readonly: true, rows: 3, cols: 60 } },
            expressions: population(
              'primarySource',
              'event.value.loading ? "" : ($exists(event.value.records[0].metadata.title) ? event.value.records[0].metadata.title : "")'
            ),
          },
        ] satisfies Component[]
    ),
    {
      name: 'activityDates',
      relatedDisplay: { relationId: 'primaryActivity' },
      model: { class: 'GroupModel' },
      component: {
        class: 'GroupComponent',
        config: { componentDefinitions: [input('startDate', 'Start date'), input('endDate', 'End date')] },
      },
      expressions: population(
        'primarySource',
        'event.value.loading ? {"startDate":"", "endDate":""} : {"startDate": $exists(event.value.records[0].metadata.startDate) ? event.value.records[0].metadata.startDate : "", "endDate": $exists(event.value.records[0].metadata.endDate) ? event.value.records[0].metadata.endDate : ""}'
      ),
    },
    {
      name: 'activitySummaries',
      relatedDisplay: { relationId: 'activities' },
      model: { class: 'RepeatableModel', config: { defaultValue: [] } },
      component: {
        class: 'RepeatableComponent',
        config: {
          allowZeroRows: true,
          elementTemplate: {
            name: '',
            model: { class: 'GroupModel' },
            component: {
              class: 'GroupComponent',
              config: {
                componentDefinitions: [
                  input('title', 'Activity title'),
                  input('startDate', 'Start date'),
                  input('endDate', 'End date'),
                ],
              },
            },
          },
        },
      },
      expressions: population(
        'activitiesSource',
        'event.value.loading ? [] : [event.value.records.{"title": metadata.title, "startDate": metadata.startDate, "endDate": metadata.endDate}]'
      ),
    },
    { name: 'save', component: { class: 'SaveButtonComponent', config: { label: 'Save plan' } } },
    { name: 'status', component: { class: 'SaveStatusComponent' } },
  ],
};
export default form;
