import { expect } from 'chai';
import { Services as SchemaServices } from '../../src/services/GenerationSchemaService';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

describe('Generation metadata paths', () => {
  it('resolves saved metadata beneath layout-only tabs and panels', () => {
    const form: FormConfigFrame = {
      name: 'tabbed', type: 'plan', componentDefinitions: [{
        name: 'mainTab', component: { class: 'TabComponent', config: { tabs: [{
          name: 'details', component: { class: 'TabContentComponent', config: { panels: [{
            name: 'panel', component: { class: 'PanelComponent', config: { componentDefinitions: [{
              name: 'summary', model: { class: 'TextAreaModel', config: {} },
              component: { class: 'TextAreaComponent', config: {} },
            }] } },
          }] } },
        }] } },
      }],
    };
    const targets = new SchemaServices.GenerationSchemaService().resolveFormTargets(form);
    expect(targets.get('/summary')).to.deep.equal({
      metadataPointer: '/summary', componentClass: 'TextAreaComponent', disabled: false,
    });
    expect(targets.has('/mainTab/details/panel/summary')).to.equal(false);
  });

  it('retains real group nesting and JSON Pointer escaping', () => {
    const form: FormConfigFrame = {
      name: 'grouped', type: 'plan', componentDefinitions: [{
        name: 'project', component: { class: 'GroupComponent', config: { componentDefinitions: [{
          name: 'title/~', model: { class: 'SimpleInputModel', config: {} },
          component: { class: 'SimpleInputComponent', config: {} },
        }] } },
      }],
    };
    const targets = new SchemaServices.GenerationSchemaService().resolveFormTargets(form);
    expect(targets.get('/project/title~1~0')?.metadataPointer).to.equal('/project/title~1~0');
    expect(targets.has('/project')).to.equal(true);
  });
});
