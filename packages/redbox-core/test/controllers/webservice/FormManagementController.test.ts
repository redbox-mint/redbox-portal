import { expect } from 'chai';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Forms } from '../../../src/forms/Forms';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { referenceFixtures } from '../../helpers/serviceRepositories';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountConfigurationReadRoutes } from '../../../src/http/express/configuration';
import type { FormAttributes } from '../../../src/persistence/rows';

describe('Form management discovery through owned HTTP and public projection', () => {
  let formsService: Forms;
  let loadRecord: sinon.SinonStub;
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  beforeEach(async () => {
    loadRecord = sinon.stub().resolves(null);
    const brand = Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' });
    formsService = new Forms({
      repository: referenceFixtures(),
      log: nothingLogger,
      config: { appmode: {} },
      records: {
        getMeta: loadRecord,
        hasViewAccess: () => true,
        hasEditAccess: () => true,
        hasTransitionRoleAuthorization: () => true,
      },
      validation: { discoverOperations: async () => [] },
      recordTypes: { get: () => of(null!) },
      workflowSteps: { getAllForRecordType: () => of([]) },
      vocabulary: { getEntries: async () => null!, defaultBrand: () => 'default' },
      formRegistry: () => ({}),
      defaultBrand: () => brand,
    });
    f = await httpRouteFixture((router, input) =>
      mountConfigurationReadRoutes(router, { ...input, forms: formsService, loadRecord } as any)
    );
  });
  afterEach(async () => {
    await f.close();
    sinon.restore();
  });

  it('adds only safe discovery fields and strips the internal operation definition', async function () {
    const form = {
      id: 'form-1',
      name: 'dataset-draft',
      branding: 'brand-1',
      configuration: {
        name: 'dataset-draft',
        type: 'dataset',
        validationOperations: {
          submit: {
            enabledValidationGroups: ['submission-secret'],
            roles: ['SecretRole'],
            allowedTargetSteps: ['private-stage'],
          },
        },
        componentDefinitions: [],
      },
    };
    sinon.stub(formsService, 'getFormByName').returns(of(form));
    sinon.stub(formsService, 'discoverValidationOperations').resolves([
      {
        name: 'submit',
        label: 'Submit',
        description: 'Send for review',
        allowedTargetSteps: ['review'],
      },
    ]);

    const response = await f.request(
      '/default/portal/api/forms/get?name=dataset-draft&editable=true&recordType=dataset'
    );

    expect(response.status).to.equal(200);
    const body = response.body;
    expect(body.configuration).not.to.have.property('validationOperations');
    expect(body.validationOperations).to.deep.equal([
      {
        name: 'submit',
        label: 'Submit',
        description: 'Send for review',
        allowedTargetSteps: ['review'],
      },
    ]);
    const transported = JSON.stringify(body.validationOperations);
    expect(transported).not.to.include('SecretRole');
    expect(transported).not.to.include('submission-secret');
    expect(transported).not.to.include('private-stage');
  });

  it('strips operation policy from form lists where caller context is unavailable', async function () {
    sinon.stub(formsService, 'listForms').returns(
      of([
        {
          id: 'form-1',
          name: 'dataset-draft',
          branding: 'brand-1',
          configuration: {
            validationOperations: {
              submit: { enabledValidationGroups: ['secret'], roles: ['Admin'] },
            },
          },
        },
      ] as unknown as FormAttributes[])
    );

    const response = await f.request('/default/portal/api/forms');

    expect(response.status).to.equal(200);
    const body = response.body;
    expect(body.records[0].configuration).not.to.have.property('validationOperations');
    expect(body.records[0]).not.to.have.property('validationOperations');
    expect(JSON.stringify(body)).not.to.include('Admin');
    expect(JSON.stringify(body)).not.to.include('secret');
  });

  it('omits discovery when a requested record context cannot be loaded safely', async function () {
    sinon.stub(formsService, 'getFormByName').returns(
      of({
        id: 'form-1',
        name: 'dataset-draft',
        branding: 'brand-1',
        configuration: { name: 'dataset-draft', type: 'dataset', componentDefinitions: [] },
      })
    );
    const discover = sinon.stub(formsService, 'discoverValidationOperations').resolves([{ name: 'submit' }]);
    loadRecord.rejects(new Error('raw storage failure'));

    const response = await f.request(
      '/default/portal/api/forms/get?name=dataset-draft&editable=true&oid=unavailable-record'
    );

    expect(discover.called).to.equal(false);
    expect(response.body.validationOperations).to.deep.equal([]);
    expect(JSON.stringify(response.body)).not.to.include('raw storage failure');
  });

  it('omits discovery when the loaded record belongs to another brand', async function () {
    sinon.stub(formsService, 'getFormByName').returns(
      of({
        id: 'form-1',
        name: 'dataset-draft',
        branding: 'brand-1',
        configuration: { name: 'dataset-draft', type: 'dataset', componentDefinitions: [] },
      })
    );
    const discover = sinon.stub(formsService, 'discoverValidationOperations').resolves([{ name: 'submit' }]);
    loadRecord.resolves({
      redboxOid: 'other-brand-record',
      metadata: {},
      metaMetadata: { brandId: 'brand-2', type: 'dataset', form: 'dataset-draft' },
    });

    const response = await f.request(
      '/default/portal/api/forms/get?name=dataset-draft&editable=true&oid=other-brand-record'
    );

    expect(discover.called).to.equal(false);
    expect(response.body.validationOperations).to.deep.equal([]);
  });
});
