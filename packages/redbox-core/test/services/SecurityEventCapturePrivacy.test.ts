import { expect } from 'chai';
import * as lodash from 'lodash';
import * as sinon from 'sinon';
import { Services as SecurityServices } from '../../src/services/SecurityEventService';
import { Services as RecordServices } from '../../src/services/RecordsService';
import { Services as UserServices } from '../../src/services/UsersService';
import { Controllers } from '../../src/controllers/UserController';
import { RequestDetails } from '../../src/model/RequestDetails';
import { checkAuth } from '../../src/policies/checkAuth';
import { DEFAULT_SIEM_REDACTION } from '../../src/configmodels/SiemConfiguration';
import { limitPayloadSize, redactForSiem } from '../../src/services/siem/SiemPayloadRedactor';
import { createMockSails, createQueryObject } from './testHelper';

describe('SIEM capture and privacy regression boundaries', () => {
  const globals = [
    '_',
    'sails',
    'BrandingService',
    'AppConfigService',
    'AgendaQueueService',
    'SecurityEventService',
    'UserAudit',
    'Record',
    'PathRulesService',
    'RolesService',
    'UsersService',
    'ConfigService',
  ];
  const originals = new Map<string, unknown>();
  let service: SecurityServices.SecurityEventService;
  let queued: Array<{ event: Record<string, unknown> }>;
  let enabled: boolean;
  let maxPayloadBytes: number;
  beforeEach(() => {
    for (const key of globals) originals.set(key, Reflect.get(globalThis, key));
    queued = [];
    enabled = true;
    maxPayloadBytes = DEFAULT_SIEM_REDACTION.maxPayloadBytes;
    service = new SecurityServices.SecurityEventService();
    Object.assign(globalThis, {
      _: lodash,
      sails: createMockSails({
        config: { environment: 'production', record: { auditing: { enabled: true, recordAuditJobName: 'audit' } } },
      }),
      BrandingService: {
        getBrandById: (id: string) => ({ id, name: id === 'other-id' ? 'other' : 'default' }),
        getBrand: (name: string) => ({ id: `${name}-id`, name }),
        getBrandFromReq: (req: { params: { branding: string } }) => ({
          id: `${req.params.branding}-id`,
          name: req.params.branding,
        }),
        getBrandNameFromReq: () => 'other',
        getFullPath: () => '/other/rdmp',
        getPortalFromReq: (req: { params: { portal: string } }) => req.params.portal,
      },
      AppConfigService: {
        getAppConfigurationForBrand: () => ({
          siem: {
            enabled,
            redaction: { maxPayloadBytes },
            events: { severity: { 'integration.failure': 'critical' } },
          },
        }),
      },
      AgendaQueueService: {
        now: async (_name: string, data: { event: Record<string, unknown> }) => {
          queued.push(data);
        },
      },
      SecurityEventService: service,
      UserAudit: { create: (data: unknown) => createQueryObject(data) },
      Record: { findOne: async () => undefined },
    });
  });
  afterEach(() => {
    for (const key of globals) {
      const original = originals.get(key);
      if (original === undefined) Reflect.deleteProperty(globalThis, key);
      else Reflect.set(globalThis, key, original);
    }
    sinon.restore();
  });
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
  const request = (brand: string) => ({
    params: { branding: brand, portal: 'rdmp' },
    session: { branding: brand },
    method: 'POST',
    path: '/login',
    headers: { 'user-agent': 'PRIVATE-AGENT', authorization: 'PRIVATE-TOKEN' },
    ip: 'PRIVATE-IP',
    body: { password: 'PRIVATE-PASSWORD' },
    cookies: { session: 'PRIVATE-COOKIE' },
  });

  it('emits exactly once after the actual production record worker persists successfully', async () => {
    const records = new RecordServices.Records();
    const persist = sinon.stub().resolves({ isSuccessful: () => true });
    Reflect.set(records, 'storageService', { createRecordAudit: persist });
    await records.storeRecordAudit({
      attrs: { data: { redboxOid: 'record-1', action: 'updated', record: { metaMetadata: { brandId: 'other-id' } } } },
    });
    await tick();
    expect(persist.callCount).to.equal(1);
    expect(queued).to.have.length(1);
    expect(queued[0].event.brandId).to.equal('other-id');
    persist.resolves({ isSuccessful: () => false });
    await records.storeRecordAudit({ attrs: { data: { action: 'updated' } } });
    expect(queued).to.have.length(1);
  });

  it('captures integrationtest direct audits and keeps queue failure out of storage outcomes', async () => {
    const records = new RecordServices.Records();
    Reflect.set(records, 'storageService', { createRecordAudit: async () => ({ isSuccessful: () => true }) });
    Reflect.set(sails.config, 'environment', 'integrationtest');
    await records.auditRecord('record-1', { metaMetadata: { brandId: 'other-id' } }, {});
    await tick();
    expect(queued).to.have.length(1);
    Object.assign(globalThis, {
      SecurityEventService: {
        emitFromRecordAudit: () => {
          throw new Error('queue unavailable');
        },
      },
    });
    const response = await records.createRecordAudit({ action: 'updated' });
    expect(response.isSuccessful()).to.equal(true);
  });

  it('captures successful modern post-commit reconciliation through its public worker', async () => {
    const records = new RecordServices.Records();
    const persist = sinon.stub().resolves({ isSuccessful: () => true });
    Reflect.set(records, 'storageService', { createRecordAudit: persist });
    sinon.stub(records, 'getMeta').resolves({
      id: 'record-1',
      redboxOid: 'record-1',
      harvestId: '',
      metadata: {},
      metaMetadata: {
        brandId: 'other-id',
        createdBy: 'migration',
        type: 'rdmp',
        searchCore: 'redbox',
        form: 'rdmp',
        attachmentFields: [],
      },
      workflow: { stage: 'draft', stageLabel: 'Draft' },
      dateCreated: '2026-01-01',
      lastSaveDate: '2026-01-01',
      authorization: {
        edit: [],
        view: [],
        editRoles: [],
        viewRoles: [],
        editPending: [],
        viewPending: [],
        stored: { edit: [], view: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] },
      },
    });
    await records.reconcilePostCommitSave({
      attrs: {
        data: {
          schemaVersion: 1,
          oid: 'record-1',
          searchable: false,
          action: 'updated',
          actor: { service: 'migration' },
          resolution: 'direct',
        },
      },
    });
    await tick();
    expect(persist.callCount).to.equal(1);
    expect(queued).to.have.length(1);
    expect(queued[0].event.brandId).to.equal('other-id');
    expect(queued[0].event.eventType).to.equal('record.updated');
  });

  it('preserves request branding for real user login/logout audit and sanitizes attributes before serialization', async () => {
    const users = new UserServices.Users();
    for (const [brand, action] of [
      ['other', 'login'],
      ['default', 'logout'],
    ]) {
      const details = Reflect.construct(RequestDetails, [request(brand)]);
      await users.addUserAuditEvent(
        { id: 'u1', email: 'PRIVATE-EMAIL', additionalAttributes: { nested: { token: 'PRIVATE-TOKEN', safe: true } } },
        action,
        details
      );
      await tick();
    }
    expect(queued.map(item => item.event.brandId)).to.deep.equal(['other-id', 'default-id']);
    expect(queued.map(item => item.event.portalId)).to.deep.equal(['rdmp', 'rdmp']);
    expect(queued.map(item => item.event.eventType)).to.deep.equal([
      'authentication.login.success',
      'authentication.logout.success',
    ]);
    const serialized = JSON.stringify(queued);
    for (const secret of [
      'PRIVATE-EMAIL',
      'PRIVATE-IP',
      'PRIVATE-AGENT',
      'PRIVATE-TOKEN',
      'PRIVATE-PASSWORD',
      'PRIVATE-COOKIE',
    ])
      expect(serialized).not.to.include(secret);
    expect(serialized).to.include('[REDACTED]');
    expect(serialized).to.include('safe');
  });

  it('captures failed authentication and authorization denial through actual controller/policy seams', async () => {
    const controller = new Controllers.User();
    const mockSails = createMockSails({
      config: {
        passport: {
          authenticate:
            (_strategy: string, callback: (error: unknown, user: boolean, info: { message: string }) => void) => () =>
              callback(null, false, { message: 'invalid credentials' }),
        },
        auth: {},
        http: {},
      },
    });
    Reflect.set(globalThis, 'sails', mockSails);
    const req = request('other');
    const response = {
      send: sinon.stub(),
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
      redirect: sinon.stub(),
      serverError: sinon.stub(),
    };
    Object.assign(globalThis, { ConfigService: { getBrand: () => ({ oidc: {} }) } });
    Reflect.apply(controller.localLogin, controller, [req, response]);
    await tick();
    expect(queued[0].event.eventType).to.equal('authentication.login.failure');
    expect(queued[0].event.brandId).to.equal('other-id');
    Reflect.apply(controller.openidConnectLogin, controller, [{ ...req, param: () => undefined }, response]);
    Reflect.apply(controller.aafLogin, controller, [req, response]);
    await tick();
    expect(queued).to.have.length(3);
    expect(queued.every(item => item.event.eventType === 'authentication.login.failure')).to.equal(true);
    Object.assign(globalThis, { PathRulesService: { getRulesFromPath: () => ({}), canRead: () => false } });
    Reflect.apply(checkAuth, undefined, [
      { ...req, isAuthenticated: () => true, user: { id: 'u1' } },
      response,
      sinon.stub(),
    ]);
    await tick();
    expect(queued[3].event.eventType).to.equal('authorization.failure');
    expect(response.status.calledWith(403)).to.equal(true);
  });

  it('emits successful login/logout only after session success and keeps their request brands', async () => {
    const users = new UserServices.Users();
    const user = { id: 'u1', username: 'someone', email: 'private@example.test' };
    const mockSails = createMockSails({
      config: {
        auth: { postLogoutRedir: '/home' },
        passport: {
          authenticate: (_strategy: string, callback: (error: unknown, user: object, info: object) => void) => () =>
            callback(null, user, {}),
        },
      },
      getActions: () => ({ 'user/redirpostlogin': sinon.stub() }),
    });
    Object.assign(globalThis, { sails: mockSails, UsersService: users });
    const controller = new Controllers.User();
    const response = { send: sinon.stub(), redirect: sinon.stub() };
    const loginRequest = {
      ...request('other'),
      logIn: (_user: unknown, callback: (error: unknown) => void) => callback(null),
    };
    Reflect.apply(controller.localLogin, controller, [loginRequest, response]);
    await tick();
    Reflect.apply(controller.logout, controller, [
      { ...request('default'), user, logout: (callback: (error: unknown) => void) => callback(null) },
      response,
    ]);
    await tick();
    expect(queued.map(item => item.event.brandId)).to.deep.equal(['other-id', 'default-id']);
    expect(queued.map(item => item.event.eventType)).to.deep.equal([
      'authentication.login.success',
      'authentication.logout.success',
    ]);
    Reflect.apply(controller.localLogin, controller, [
      {
        ...loginRequest,
        logIn: (_user: unknown, callback: (error: unknown) => void) => callback(new Error('session failed')),
      },
      response,
    ]);
    await tick();
    expect(queued).to.have.length(3);
    expect(queued[2].event.eventType).to.equal('authentication.login.failure');
  });

  it('enqueues a normal login event at the minimum accepted budget with canonical identity intact', async () => {
    maxPayloadBytes = 1024;
    await service.emitFromUserAudit({ id: 'user-1', username: 'researcher', email: 'private@example.test' }, 'login', {
      brandId: 'other-id',
      portalId: 'rdmp',
      method: 'POST',
      path: '/other/rdmp/login',
    });
    expect(queued).to.have.length(1);
    const event = queued[0].event;
    expect(event.eventId).to.be.a('string').with.length(36);
    expect(event).to.include({
      brandId: 'other-id',
      portalId: 'rdmp',
      eventType: 'authentication.login.success',
      category: 'authentication',
      severity: 'info',
      source: 'UsersService',
      deliveryState: 'pending',
    });
    expect(event.occurredAt).to.be.a('string');
    expect(event.actor).to.deep.equal({ id: 'user-1', username: 'researcher' });
    expect(Buffer.byteLength(JSON.stringify(event), 'utf8')).to.be.at.most(1024);
  });

  it('enqueues oversized Unicode login details at the minimum with an explicit bounded marker', async () => {
    maxPayloadBytes = 1024;
    await service.emitSecurityEvent({
      brandId: 'other-id',
      portalId: 'rdmp',
      eventType: 'authentication.login.success',
      category: 'authentication',
      source: 'UsersService',
      correlationId: '😀'.repeat(64),
      traceId: '😀'.repeat(64),
      actor: { id: 'user-1', displayName: '😀'.repeat(3000) },
      requestContext: { path: '/' + '😀'.repeat(3000) },
      payload: { text: '😀'.repeat(3000) },
    });
    expect(queued).to.have.length(1);
    const event = queued[0].event;
    expect(event).to.include({
      brandId: 'other-id',
      portalId: 'rdmp',
      eventType: 'authentication.login.success',
      category: 'authentication',
      source: 'UsersService',
      correlationId: '😀'.repeat(64),
      traceId: '😀'.repeat(64),
    });
    expect(event.payload).to.have.property('truncated', true);
    expect(Buffer.byteLength(JSON.stringify(event), 'utf8')).to.be.at.most(1024);
    const deliveryPayload = redactForSiem(event, { ...DEFAULT_SIEM_REDACTION, maxPayloadBytes });
    expect(deliveryPayload.eventId).to.equal(event.eventId);
    expect(Buffer.byteLength(JSON.stringify(deliveryPayload), 'utf8')).to.be.at.most(1024);
  });

  it('honors configured severity and no-ops when disabled or brand is unknown', async () => {
    await service.emitFromIntegrationAudit({ brandId: 'other-id', status: 'failed' });
    expect(queued[0].event.severity).to.equal('critical');
    enabled = false;
    await service.emitFromUserAudit({}, 'login', { brandId: 'other-id' });
    enabled = true;
    await service.emitFromUserAudit({}, 'login', {});
    await service.emitFromRecordAudit({ action: 'updated' });
    expect(queued).to.have.length(1);
  });

  it('excludes repeated private fields, decodes only known attributes, and redacts mandatory credentials', () => {
    const result = redactForSiem(
      {
        actor: { email: 'PRIVATE' },
        resource: {
          accessedBy: { email: 'PRIVATE' },
          ipAddress: 'PRIVATE',
          userAgent: 'PRIVATE',
          additionalAttributes: '{"token":"PRIVATE","email":"PRIVATE","ok":true}',
          ordinary: '{"token":"opaque string"}',
        },
        payload: {
          headers: { 'X-Api-Key': 'PRIVATE', 'User-Agent': 'PRIVATE' },
          nested: [{ client_secret: 'PRIVATE', ip: 'PRIVATE' }],
        },
      },
      { ...DEFAULT_SIEM_REDACTION, denylistedPaths: [] }
    );
    expect(JSON.stringify(result)).not.to.include('PRIVATE');
    expect(JSON.stringify(result)).to.include('opaque string');
    expect(JSON.stringify(result)).to.include('"ok":true');
  });

  it('respects privacy opt-ins while always redacting credentials', () => {
    const result = redactForSiem(
      {
        actor: { email: 'visible@example.test' },
        requestContext: { ip: '192.0.2.1', userAgent: 'visible' },
        payload: { password: 'PRIVATE' },
      },
      { ...DEFAULT_SIEM_REDACTION, includeActorEmail: true, includeIpAddress: true, includeUserAgent: true }
    );
    expect(JSON.stringify(result)).to.include('visible@example.test');
    expect(JSON.stringify(result)).to.include('192.0.2.1');
    expect(JSON.stringify(result)).to.include('"userAgent":"visible"');
    expect(JSON.stringify(result)).not.to.include('PRIVATE');
  });

  it('preserves metadata and truncation marker and bounds final Unicode JSON bytes', () => {
    const config = { ...DEFAULT_SIEM_REDACTION, maxPayloadBytes: 512 };
    const input = {
      eventId: 'event-1',
      brandId: 'other-id',
      eventType: 'record.updated',
      category: 'recordLifecycle',
      severity: 'info',
      occurredAt: '2026-01-01',
      source: 'RecordsService',
      deliveryState: 'pending',
      payload: { text: '😀'.repeat(3000) },
    };
    const limited = redactForSiem(input, config);
    expect(limited.eventId).to.equal('event-1');
    expect(limited.eventType).to.equal('record.updated');
    expect(limited.payload).to.have.property('truncated', true);
    expect(Buffer.byteLength(JSON.stringify(limited))).to.be.at.most(512);
    const diagnostic = limitPayloadSize({ error: '😀'.repeat(3000) }, 256);
    expect(Buffer.byteLength(JSON.stringify(diagnostic))).to.be.at.most(256);
    expect(() => limitPayloadSize(input, 20)).to.throw(RangeError);
  });
});
