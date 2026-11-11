import { expect } from 'chai';
import * as sinon from 'sinon';
const migration = require('../../../../api/migrations/20261106T120000-party-record-form');
describe('Party record form migration', () => {
  it('upgrades only stock read-only starting forms and keeps custom forms intact', async () => {
    const set = sinon.stub().resolves(); const bootstrap = sinon.stub().resolves();
    const updateOne = sinon.stub().returns({ set });
    const stock = { id: 'stock', config: { form: 'generated-view-only', workflow: { stage: 'draft' } } };
    const context = { models: { recordtype: { find: sinon.stub().resolves([{ id: 'type-a', branding: 'brand-a' }]) }, workflowstep: { find: sinon.stub().resolves([stock, { id: 'custom', config: { form: 'custom-party' } }]), updateOne } }, services: { formsservice: { bootstrap } } };
    await migration.up({ context });
    expect(bootstrap.calledOnce).to.equal(true);
    expect(bootstrap.firstCall.args[0].config.form).to.equal('party-1.0-draft');
    expect(bootstrap.firstCall.args[1]).to.equal('brand-a');
    expect(updateOne.firstCall.args[0]).to.deep.equal({ id: 'stock' });
    expect(set.firstCall.args[0].config.workflow).to.deep.equal(stock.config.workflow);
  });
});
