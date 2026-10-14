import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Controllers as RestControllers } from '../../../src/controllers/webservice/AppConfigController';
import { Controllers as FormControllers } from '../../../src/controllers/AppConfigController';
import { APP_CONFIG_SECRET_MASK, Services } from '../../../src/services/AppConfigService';
import { normalizeSiemConfiguration, SiemConfigurationError } from '../../../src/configmodels/SiemConfiguration';
import { validateApiRouteRequest } from '../../../src/api-routes/validation';
import { saveAppConfigByIdRoute } from '../../../src/api-routes/groups/appconfig';
import type { BuildResponseType } from '../../../src/model/BuildResponse';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from '../../services/testHelper';

class TestRestAppConfig extends RestControllers.AppConfig {
  public override sendResp(req: Sails.Req, res: Sails.Res, response?: BuildResponseType) {
    return super.sendResp(req, res, response);
  }
}

const target = { id: 'one', adapterType: 'cef', endpointUrl: 'https://collector.example/ingest' };
const reservedNames = [
  'constructor',
  'Constructor',
  'CONSTRUCTOR',
  'prototype',
  'Prototype',
  'PROTOTYPE',
  '__proto__',
  '__Proto__',
  '__PROTO__',
];

describe('SIEM shared header validation and generic AppConfig boundaries', () => {
  let service: Services.AppConfigs;
  let create: sinon.SinonStub;
  let updateOne: sinon.SinonStub;
  let set: sinon.SinonStub;
  const brand = { id: 'brand', name: 'default' };
  const stored = normalizeSiemConfiguration({ destinations: [{ ...target, token: 'stored-token' }] });

  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    service = new Services.AppConfigs();
    create = sinon.stub().callsFake(async data => data);
    set = sinon.stub().callsFake(async data => data);
    updateOne = sinon.stub().returns({ set });
    Reflect.set(global, 'AppConfig', { find: sinon.stub().resolves([{ configData: stored }]), create, updateOne });
    Reflect.set(global, 'AppConfigService', service);
    Reflect.set(global, 'BrandingService', { getBrand: () => brand });
    Reflect.set(sails.services, 'appconfigservice', service);
    sails.services.brandingservice = { getBrand: () => brand };
    sinon.stub(service, 'loadAppConfigurationModel').resolves(createMockSails());
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(global, 'AppConfig');
    Reflect.deleteProperty(global, 'AppConfigService');
    Reflect.deleteProperty(global, 'BrandingService');
  });

  for (const name of reservedNames) {
    it(`rejects the own header ${name} through shared normalization and generic persistence`, async () => {
      // Computed properties create an own __proto__ key, unlike object-literal prototype syntax.
      const config = { destinations: [{ ...target, headers: { [name]: 'credential' } }] };
      assert.throws(() => normalizeSiemConfiguration(config), SiemConfigurationError);
      await assert.rejects(
        service.createOrUpdateConfig(createMockSails(brand), 'siem', config),
        SiemConfigurationError
      );
      Reflect.set(global, 'AppConfig', { find: sinon.stub().resolves([]), create, updateOne });
      await assert.rejects(service.createConfig('default', 'siem', config), SiemConfigurationError);
      assert.equal(create.called, false);
      assert.equal(updateOne.called, false);
    });
  }

  it('masks and restores allowed arbitrary headers, including literal dotted property names', async () => {
    const headers = {
      'X-Api-Key': 'api-credential',
      'x-private': 'private-credential',
      'X.Custom.Secret': 'dotted-credential',
      'constructor.secret': 'constructor-dotted-credential',
      'prototype.secret': 'prototype-dotted-credential',
      '__proto__.secret': 'proto-dotted-credential',
      'X-Test': 'public-value',
    };
    const config = normalizeSiemConfiguration({ destinations: [{ ...target, headers }] });
    Reflect.set(global, 'AppConfig', { find: sinon.stub().resolves([{ configData: config }]), create, updateOne });
    const masked = await service.getAppConfigByBrandAndKey('brand', 'siem');
    assert.deepEqual(
      Reflect.get(Object(masked), 'destinations')[0].headers,
      Object.fromEntries(
        Object.keys(headers).map(name => [name, name === 'X-Test' ? 'public-value' : APP_CONFIG_SECRET_MASK])
      )
    );
    assert.deepEqual(config.destinations[0].headers, headers);
    await service.createOrUpdateConfig(createMockSails(brand), 'siem', { ...normalizeSiemConfiguration(masked) });
    assert.deepEqual(set.firstCall.args[0].configData.destinations[0].headers, headers);
  });

  const invalidBodies = [
    { label: 'invalid batch size', body: { delivery: { batchSize: -1 } }, message: 'batchSize' },
    {
      label: 'changed target with a mask',
      body: {
        destinations: [{ ...target, endpointUrl: 'https://changed.example/ingest', token: APP_CONFIG_SECRET_MASK }],
      },
      message: 'Replace or explicitly clear',
    },
    {
      label: 'reserved header',
      body: { destinations: [{ ...target, headers: { constructor: 'credential' } }] },
      message: 'Reserved header name',
    },
  ];
  for (const { label, body, message } of invalidBodies) {
    it(`returns REST 400 for ${label} through the actual service without writes`, async () => {
      const controller = new TestRestAppConfig();
      const response = sinon.stub(controller, 'sendResp').callsFake((_req, res) => res);
      const req = createMockSails({
        session: { branding: 'default' },
        body,
        query: {},
        params: { appConfigId: 'siem' },
        headers: {},
      });
      const validated = validateApiRouteRequest(req, saveAppConfigByIdRoute);
      assert.equal(validated.valid, true);
      if (!validated.valid) throw new Error('Invalid generic AppConfig request');
      req.apiRequest = validated;
      await controller.saveAppConfig(req, createMockSails());
      const result = response.firstCall.args[2];
      assert.ok(result);
      assert.equal(result.status, 400);
      assert.ok(result.displayErrors?.[0].title?.includes(message));
      assert.equal(create.called, false);
      assert.equal(updateOne.called, false);
    });
    it(`returns admin form 400 for ${label} through the actual service without writes`, async () => {
      const badRequest = sinon.stub();
      const serverError = sinon.stub();
      const req = createMockSails({ session: { branding: 'default' }, body, param: () => 'siem' });
      await new FormControllers.AppConfig().saveAppConfig(req, createMockSails({ badRequest, serverError }));
      assert.equal(badRequest.calledOnce, true);
      assert.ok(badRequest.firstCall.args[0].includes(message));
      assert.equal(serverError.called, false);
      assert.equal(create.called, false);
      assert.equal(updateOne.called, false);
    });
  }

  it('keeps unexpected REST storage failures as HTTP 500', async () => {
    updateOne.throws(new Error('storage unavailable'));
    const controller = new TestRestAppConfig();
    const response = sinon.stub(controller, 'sendResp').callsFake((_req, res) => res);
    const req = createMockSails({
      session: { branding: 'default' },
      apiRequest: {
        params: { appConfigId: 'siem' },
        body: { delivery: { batchSize: 2 } },
        query: {},
        headers: {},
        files: {},
      },
    });
    await controller.saveAppConfig(req, createMockSails());
    assert.equal(response.firstCall.args[2]?.status, 500);
  });
});
