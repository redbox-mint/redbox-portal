import {strict as assert} from 'node:assert';
import {FormConfigFrame, QuestionTreeFieldComponentConfigOutline} from '@researchdatabox/sails-ng-common';
import {ConstructFormConfigVisitor} from '../../src/visitor/construct.visitor';
import {ClientFormConfigVisitor} from '../../src/visitor/client.visitor';
import {reusableFormDefinitions} from '../../src/config/reusableFormDefinitions.config';
import sinon from 'sinon';
import { createSinonStubLogger } from '../logger.test';
const logger = createSinonStubLogger(sinon);

describe('Explicit question-tree legacy answer loading', () => {
  function config(prefix: string | undefined = 'old-item-'): FormConfigFrame {
    return {name: 'legacy-test', componentDefinitions: [{name: 'tree',
      component: {class: 'QuestionTreeComponent', config: {legacyFieldPrefix: prefix,
        availableOutcomes: [{value: 'Public'}, {value: 'Protected'}], componentDefinitions: [],
        questions: [
          {id: 'root', answersMin: 1, answersMax: 1, answers: [{value: 'yes'}, {value: 'no', outcome: 'Public'}], rules: {op: 'true'}},
          {id: 'child', answersMin: 1, answersMax: 1, answers: [{value: 'yes', outcome: 'Protected'}, {value: 'no'}], rules: {op: 'in', q: 'root', a: ['yes']}}
        ]}}, model: {class: 'QuestionTreeModel', config: {}}},
      {name: 'unrelated', component: {class: 'SimpleInputComponent', config: {}}}]};
  }
  async function construct(record: Record<string, unknown>, data = config()) {
    const before = structuredClone(record);
    const form = await new ConstructFormConfigVisitor(logger).start({data, record, formMode: 'edit', reusableFormDefs: reusableFormDefinitions});
    assert.deepEqual(record, before, 'opening a form must not mutate the source record');
    return form;
  }
  it('loads only configured legacy questions and supplies consistent child visibility without changing source metadata', async () => {
    const form = await construct({'old-item-root': 'yes', 'old-item-child': 'yes', 'old-item-unknown': 'secret', unrelated: 'kept'});
    assert.deepEqual(form.componentDefinitions[0].model?.config?.value, {root: 'yes', child: 'yes'});
    const tree = form.componentDefinitions[0].component.config as QuestionTreeFieldComponentConfigOutline;
    assert.equal(tree.componentDefinitions[1].component.config?.visible, true);
    assert.equal(form.componentDefinitions[1].model?.config?.value, 'kept');
    const client = await new ClientFormConfigVisitor(logger).start({form, formMode: 'edit', userRoles: ['Researcher']});
    assert.equal((client.componentDefinitions[0].component.config as QuestionTreeFieldComponentConfigOutline).legacyFieldPrefix, 'old-item-');
  });
  it('clears inactive legacy answers in the construction snapshot', async () => {
    const form = await construct({'old-item-root': 'no', 'old-item-child': 'yes'});
    assert.deepEqual(form.componentDefinitions[0].model?.config?.value, {root: 'no', child: null});
    assert.equal((form.componentDefinitions[0].component.config as QuestionTreeFieldComponentConfigOutline).componentDefinitions[1].component.config?.visible, false);
  });
  it('keeps an explicit native object or null authoritative over legacy values', async () => {
    const form = await construct({tree: {root: 'no', child: null}, 'old-item-root': 'yes', 'old-item-child': 'yes'});
    assert.deepEqual(form.componentDefinitions[0].model?.config?.value, {root: 'no', child: null});
    const empty = await construct({tree: null, 'old-item-root': 'yes'});
    assert.equal(empty.componentDefinitions[0].model?.config?.value, null);
    assert.equal((empty.componentDefinitions[0].component.config as QuestionTreeFieldComponentConfigOutline).componentDefinitions[1].component.config?.visible, false);
  });
  it('does not infer legacy prefixes or affect a record without legacy answers', async () => {
    const data = config();
    delete (data.componentDefinitions![0].component.config as QuestionTreeFieldComponentConfigOutline).legacyFieldPrefix;
    const form = await construct({'old-item-root': 'yes'}, data);
    assert.equal(form.componentDefinitions[0].model?.config?.value, undefined);
    const empty = await construct({unrelated: 'kept'});
    assert.equal(empty.componentDefinitions[0].model?.config?.value, undefined);
  });
  it('maps legacy siblings within a nested model and restores the original snapshot for later fields', async () => {
    const original = config();
    const data: FormConfigFrame = {name: 'nested-legacy', componentDefinitions: [{name: 'group',
      component: {class: 'GroupComponent', config: {componentDefinitions: original.componentDefinitions!}}},
      {name: 'tree', component: {class: 'SimpleInputComponent', config: {}}}]};
    const form = await construct({group: {'old-item-root': 'yes', 'old-item-child': 'no', unrelated: 'nested'}, tree: 'root unchanged'}, data);
    const group = form.componentDefinitions[0].component.config as {componentDefinitions: typeof form.componentDefinitions};
    assert.deepEqual(group.componentDefinitions[0].model?.config?.value, {root: 'yes', child: 'no'});
    assert.equal(group.componentDefinitions[1].model?.config?.value, 'nested');
    assert.equal(form.componentDefinitions[1].model?.config?.value, 'root unchanged');
  });
});
