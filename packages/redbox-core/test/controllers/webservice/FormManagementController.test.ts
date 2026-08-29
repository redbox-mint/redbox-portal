import * as sinon from 'sinon';
import { of } from 'rxjs';

import { Controllers } from '../../../src/controllers/webservice/FormManagementController';
import { Services as FormsServices } from '../../../src/services/FormsService';
import type { FormAttributes } from '../../../src/waterline-models/Form';
import { asScopeKey, deniedResource, type AuthorizationDecision } from '../../../src/authorization';

let expect: Chai.ExpectStatic;

describe('Webservice FormManagementController validation operation metadata', function () {
  let controller: Controllers.FormManagement;
  let formsService: FormsServices.Forms;
  let priorSails: unknown;
  let priorBrandingService: unknown;
  let priorFormsService: unknown;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    priorSails = (global as any).sails;
    priorBrandingService = (global as any).BrandingService;
    priorFormsService = (global as any).FormsService;
    (global as any).sails = {
      config: {},
      services: {},
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any)._ = require('lodash');
    (global as any).BrandingService = {
      getBrandFromReq: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getDefault: sinon.stub().returns({ id: 'default-brand', name: 'default' }),
    };
    formsService = new FormsServices.Forms();
    (global as any).FormsService = formsService;
    controller = new Controllers.FormManagement();
  });

  afterEach(function () {
    sinon.restore();
    if (priorSails === undefined) delete (global as any).sails;
    else (global as any).sails = priorSails;
    if (priorBrandingService === undefined) delete (global as any).BrandingService;
    else (global as any).BrandingService = priorBrandingService;
    if (priorFormsService === undefined) delete (global as any).FormsService;
    else (global as any).FormsService = priorFormsService;
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
    const respond = sinon.stub(controller as any, 'apiRespond');
    const req = {
      apiRequest: {
        params: {},
        query: { name: 'dataset-draft', editable: 'true', recordType: 'dataset' },
        body: {},
        files: {},
      },
      user: { username: 'alice', roles: [{ name: 'Researcher' }] },
    } as unknown as Sails.Req;

    await controller.getForm(req, {} as Sails.Res);

    const body = respond.firstCall.args[2];
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
    const respond = sinon.stub(controller as any, 'apiRespond');
    const req = {
      apiRequest: { params: {}, query: {}, body: {}, files: {} },
    } as unknown as Sails.Req;

    await controller.listForms(req, {} as Sails.Res);

    const body = respond.firstCall.args[2];
    expect(body.records[0].configuration).not.to.have.property('validationOperations');
    expect(body.records[0]).not.to.have.property('validationOperations');
    expect(JSON.stringify(body)).not.to.include('Admin');
    expect(JSON.stringify(body)).not.to.include('secret');
  });

  it('fails opaquely when a requested record context cannot be loaded safely', async function () {
    sinon.stub(formsService, 'getFormByName').returns(
      of({
        id: 'form-1',
        name: 'dataset-draft',
        branding: 'brand-1',
        configuration: { name: 'dataset-draft', type: 'dataset', componentDefinitions: [] },
      })
    );
    const discover = sinon.stub(formsService, 'discoverValidationOperations').resolves([{ name: 'submit' }]);
    const decision: AuthorizationDecision = {
      allowed: false,
      reasonCode: 'resource-not-found',
      requiredScope: asScopeKey('record.read'),
      brandId: 'brand-1',
    };
    (global as any).sails.services.recordsservice = {
      getAuthorizedMeta: sinon.stub().resolves(deniedResource(decision)),
    };
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const req = {
      apiRequest: {
        params: {},
        query: { name: 'dataset-draft', editable: 'true', oid: 'unavailable-record' },
        body: {},
        files: {},
      },
      user: { username: 'alice', roles: [] },
      resourceAuthorization: {
        context: {},
        requiredScope: asScopeKey('form.read'),
        routeId: 'form-get',
      },
    } as unknown as Sails.Req;

    await controller.getForm(req, {} as Sails.Res);

    expect(discover.called).to.equal(false);
    expect(sendResp.firstCall.args[2].errors[0]).to.include({ status: 404 });
  });

  it('uses the same opaque response when the record belongs to another brand', async function () {
    sinon.stub(formsService, 'getFormByName').returns(
      of({
        id: 'form-1',
        name: 'dataset-draft',
        branding: 'brand-1',
        configuration: { name: 'dataset-draft', type: 'dataset', componentDefinitions: [] },
      })
    );
    const discover = sinon.stub(formsService, 'discoverValidationOperations').resolves([{ name: 'submit' }]);
    const decision: AuthorizationDecision = {
      allowed: false,
      reasonCode: 'resource-brand-mismatch',
      requiredScope: asScopeKey('record.read'),
      brandId: 'brand-1',
    };
    (global as any).sails.services.recordsservice = {
      getAuthorizedMeta: sinon.stub().resolves(deniedResource(decision)),
    };
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const req = {
      apiRequest: {
        params: {},
        query: { name: 'dataset-draft', editable: 'true', oid: 'other-brand-record' },
        body: {},
        files: {},
      },
      user: { username: 'alice', roles: [] },
      resourceAuthorization: {
        context: {},
        requiredScope: asScopeKey('form.read'),
        routeId: 'form-get',
      },
    } as unknown as Sails.Req;

    await controller.getForm(req, {} as Sails.Res);

    expect(discover.called).to.equal(false);
    expect(sendResp.firstCall.args[2].errors[0]).to.include({ status: 404 });
  });
});
