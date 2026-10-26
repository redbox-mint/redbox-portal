import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpPagesFixture } from './httpPagesFixture';
import { mountFormDeliveryRoutes } from '../../src/http/express/formDelivery';

/** Actual page and form dispatch share one explicit record lookup port. */
export async function httpRecordPagesFixture(configure: Parameters<typeof httpPagesFixture>[0] = () => {}) {
  const record = {
    redboxOid: 'oid-1',
    revision: 3,
    metaMetadata: { brandId: 'brand-1', type: 'rdmp', form: 'saved-form' },
    metadata: { title: 'Saved title' },
    authorization: { view: ['alice'], edit: ['alice'] },
  };
  const form = {
    id: 'form-1',
    name: 'saved-form',
    branding: 'brand-1',
    configuration: { type: 'rdmp', componentDefinitions: [] },
  };
  const loadRecord = sinon.stub().resolves(record),
    canCreate = sinon.stub().resolves(true);
  const forms = {
    getFormByName: sinon.stub().returns(of(form)),
    getFormByStartingWorkflowStep: sinon.stub().returns(of(form)),
    getForm: sinon.stub().resolves(form),
    buildClientFormConfig: sinon.stub().resolves(form.configuration),
    discoverValidationOperations: sinon.stub().resolves([]),
  };
  const delivery = {
    forms,
    loadRecord,
    recordTypes: { get: sinon.stub().returns(of({ name: 'rdmp' })) },
    workflowSteps: { getFirst: sinon.stub().returns(of({ name: 'draft', config: { form: 'saved-form' } })) },
    prehydrate: { build: sinon.stub().resolves({}) },
    canView: sinon.stub().resolves(true),
    canEdit: sinon.stub().resolves(true),
    fingerprint: sinon.stub().resolves('form-fingerprint-1'),
  };
  const f = await httpPagesFixture((pages, router) => {
    pages.loadRecord = loadRecord;
    pages.canCreate = canCreate;
    pages.forms = forms;
    pages.translate = (_brand, _language, key) =>
      ({ 'default-title': 'Site', 'rdmp-title-label': 'RDMP', 'dataRecord-title-label': 'Data Record' })[key] ?? key;
    mountFormDeliveryRoutes(router, { ...pages, delivery, contextVariables: { evaluateContextVariables: () => ({}) } });
    configure(pages, router);
  });
  return { ...f, record, form, loadRecord, canCreate, forms, delivery };
}
