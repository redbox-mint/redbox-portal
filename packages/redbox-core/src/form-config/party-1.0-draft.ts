import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

/** The standard record form is shared by party creation, editing and validation. */
const form: FormConfigFrame = {
  name: 'party-1.0-draft', type: 'party', domElementType: 'form', editCssClasses: 'redbox-form form', attachmentFields: [],
  componentDefinitions: [
    { name: 'partyHeading', component: { class: 'ContentComponent', config: { content: {}, template: '<h1>{{t "admin-parties-details"}}</h1>' } } },
    ...(['givenName', 'surname', 'email', 'orcid'] as const).map(name => ({
      name,
      component: { class: 'SimpleInputComponent' as const, config: { type: name === 'email' ? 'email' as const : 'text' as const } },
      layout: { class: 'DefaultLayout' as const, config: { label: `@admin-parties-field-${name}` } },
      model: { class: 'SimpleInputModel' as const, config: { validators: name === 'email' ? [{ class: 'required' }, { class: 'email' }] : name === 'givenName' ? [{ class: 'required' }] : [] } },
    })),
    { name: 'partySave', constraints: { allowModes: ['edit'] }, component: { class: 'SaveButtonComponent', config: { label: '@admin-parties-save', redirectLocation: '/@branding/@portal/admin/parties' } } },
    { name: 'partyReturn', component: { class: 'ContentComponent', config: { content: {}, template: '<a class="btn btn-outline-secondary" href="{{concat "/" branding "/" portal "/admin/parties"}}">{{t "admin-parties-back"}}</a>' } } },
  ],
};
export default form;
