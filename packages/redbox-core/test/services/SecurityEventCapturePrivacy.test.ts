const collaborators: any = {};
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import { installIdentityRepositoryMock } from '../helpers/identityMock';
import { expect } from 'chai';
import * as lodash from 'lodash';
import * as sinon from 'sinon';
import { Services as SecurityServices } from '../../src/services/SecurityEventService';
import { Services as RecordServices } from '../../src/services/RecordsService';
import { Services as UserServices } from '../../src/services/UsersService';
import type { Request, Response } from 'express';
import { authenticationFailureEvent } from '../../src/http/express/login';
import { getIdentityRepositories } from '../../src/persistence/identity/runtime';
import { RequestDetails } from '../../src/model/RequestDetails';
import { DEFAULT_SIEM_REDACTION } from '../../src/configmodels/SiemConfiguration';
import { limitPayloadSize, redactForSiem } from '../../src/services/siem/SiemPayloadRedactor';
import { createDomainFixture, createQueryObject } from './testHelper';

describe('SIEM capture and privacy regression boundaries', () => {
  const globals = [
    '_',
    'environment',
    'BrandingService',
    'AppConfigService',
    'AgendaQueueService',
    'SecurityEventService',
    'RecordsService',
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
    installIdentityRepositoryMock();
    for (const key of globals) originals.set(key, Reflect.get(collaborators, key));
    queued = [];
    enabled = true;
    maxPayloadBytes = DEFAULT_SIEM_REDACTION.maxPayloadBytes;
    service = new SecurityServices.SecurityEventService({
      repository: {} as any,
      get log() {
        return collaborators.environment.log;
      },
      brand: value =>
        collaborators.BrandingService.getBrandById(value) ?? collaborators.BrandingService.getBrand(value),
      configuration: name => collaborators.AppConfigService.getAppConfigurationForBrand(name)?.siem,
      enqueue: (name, data) => collaborators.AgendaQueueService.now(name, data),
      record: oid => collaborators.RecordsService.getMeta(oid),
    });
    (Object.assign(repositoryFixtures, { UserAudit: { create: (data: unknown) => createQueryObject(data) } }),
      Object.assign(collaborators, {
        _: lodash,
        environment: createDomainFixture({
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
        RecordsService: { getMeta: async () => undefined },
      }));
  });
  afterEach(() => {
    for (const key of globals) {
      const original = originals.get(key);
      if (original === undefined) Reflect.deleteProperty(collaborators, key);
      else Reflect.set(collaborators, key, original);
    }
    sinon.restore();
  });
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
  // The fixtures provide the Express fields exercised here; socket and
  // transport internals are intentionally absent. Check supplied fields before
  // completing the transport type, so public calls keep their real signatures.
  const request = (brand: string): Request => {
    const fixture: Partial<Request> = {
      params: { branding: brand, portal: 'rdmp' },
      session: { branding: brand } as Request['session'],
      method: 'POST',
      path: '/login',
      headers: { 'user-agent': 'PRIVATE-AGENT', authorization: 'PRIVATE-TOKEN' },
      ip: 'PRIVATE-IP',
      body: { username: 'alice', password: 'PRIVATE-PASSWORD' },
      cookies: { session: 'PRIVATE-COOKIE' },
      get: name => fixture.headers?.[name.toLowerCase()],
    };
    return fixture as Request;
  };
  const responseFixture = () => {
    const fixture = {
      send: sinon.stub(),
      end: sinon.stub(),
      status: sinon.stub().returnsThis(),
      json: sinon.stub(),
      redirect: sinon.stub<[urlOrStatus: string | number, url?: string], void>(),
      serverError: sinon.stub(),
    };
    return fixture as typeof fixture & Response;
  };

  it('emits exactly once after the actual production record worker persists successfully', async () => {
    const records = new RecordServices.Records({
      log: collaborators.environment.log,
      get config() {
        return collaborators.environment.config;
      },
      storageService: {} as any,
      emitSecurityEvent: entry => collaborators.SecurityEventService.emitFromRecordAudit(entry),
    } as any);
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
    const records = new RecordServices.Records({
      log: collaborators.environment.log,
      get config() {
        return collaborators.environment.config;
      },
      storageService: {} as any,
      emitSecurityEvent: entry => collaborators.SecurityEventService.emitFromRecordAudit(entry),
    } as any);
    Reflect.set(records, 'storageService', { createRecordAudit: async () => ({ isSuccessful: () => true }) });
    Reflect.set(collaborators.environment.config, 'environment', 'integrationtest');
    await records.auditRecord('record-1', { metaMetadata: { brandId: 'other-id' } }, {});
    await tick();
    expect(queued).to.have.length(1);
    Object.assign(collaborators, {
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
    const records = new RecordServices.Records({
      log: collaborators.environment.log,
      get config() {
        return collaborators.environment.config;
      },
      storageService: {} as any,
      emitSecurityEvent: entry => collaborators.SecurityEventService.emitFromRecordAudit(entry),
    } as any);
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
    const users = new UserServices.Users({
      repository: getIdentityRepositories(),
      log: collaborators.environment.log,
      accounts: {} as any,
      defaultBrand: () => ({ id: 'default-id', name: 'default' }) as any,
      emitSecurityEvent: (...args) => service.emitFromUserAudit(...args),
    });
    for (const [brand, action] of [
      ['other', 'login'],
      ['default', 'logout'],
    ]) {
      const details = new RequestDetails(request(brand), { brandId: `${brand}-id`, portalId: 'rdmp' });
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

  it('accepts an explicit subject at the public request failure seam without capturing request body', async () => {
    await service.emitSecurityEvent(
      authenticationFailureEvent(request('other'), { brandId: 'other-id', portalId: 'rdmp' })
    );
    expect(queued[0].event.subject).to.deep.equal({ username: 'alice' });
    expect(JSON.stringify(queued)).not.to.include('PRIVATE-PASSWORD');
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

  it('matches custom dotted denylist paths in both content roots at segment boundaries', () => {
    const content = {
      record: { metadata: { description: 'SECRET-DESC', title: 'visible' } },
      headers: { 'X-Session': 'S' },
      connection: { apiSecret: 'C' },
      nested: { private: { value: 'WILDCARD-SECRET' } },
      prerecord: { metadata: { description: 'near-match' } },
      nestedprivate: { value: 'near-wildcard-match' },
    };
    const result = redactForSiem(
      { payload: content, resource: content },
      {
        ...DEFAULT_SIEM_REDACTION,
        denylistedPaths: [
          ...DEFAULT_SIEM_REDACTION.denylistedPaths,
          'RECORD.metadata.description',
          'headers.X-Session',
          'connection.apiSecret',
          'nested.private.*',
        ],
      }
    );
    for (const root of [result.payload, result.resource]) {
      expect(root).to.deep.equal({
        record: { metadata: { description: '[REDACTED]', title: 'visible' } },
        headers: { 'X-Session': '[REDACTED]' },
        connection: { apiSecret: '[REDACTED]' },
        nested: { private: '[REDACTED]' },
        prerecord: { metadata: { description: 'near-match' } },
        nestedprivate: { value: 'near-wildcard-match' },
      });
    }
  });

  it('minimizes persisted record-worker capture to identity and concurrency context', async () => {
    const records = new RecordServices.Records({
      log: collaborators.environment.log,
      get config() {
        return collaborators.environment.config;
      },
      storageService: {} as any,
      emitSecurityEvent: entry => collaborators.SecurityEventService.emitFromRecordAudit(entry),
    } as any);
    Reflect.set(records, 'storageService', { createRecordAudit: async () => ({ isSuccessful: () => true }) });
    await records.storeRecordAudit({
      attrs: {
        data: {
          redboxOid: 'record-1',
          action: 'updated',
          occurredAt: '2026-10-14T10:00:00+10:00',
          record: { metaMetadata: { brandId: 'other-id', type: 'rdmp' }, metadata: { description: 'SECRET-DESC' } },
          user: {
            id: 'u1',
            username: 'alice',
            profile: 'PRIVATE-PROFILE',
            additionalAttributes: { secretResearch: 'PRIVATE-USER' },
          },
          concurrency: { revision: 7, resolution: 'direct', extra: 'PRIVATE-CONTEXT' },
          executionSummary: { actions: [{ message: 'PRIVATE-ACTION' }] },
        },
      },
    });
    await tick();
    expect(queued).to.have.length(1);
    const event = queued[0].event;
    expect(event.resource).to.deep.equal({
      redboxOid: 'record-1',
      action: 'updated',
      type: 'rdmp',
      brandId: 'other-id',
    });
    expect(event.actor).to.deep.equal({ id: 'u1', username: 'alice' });
    expect(event.payload).to.deep.equal({ concurrency: { revision: 7, resolution: 'direct' } });
    for (const value of ['SECRET-DESC', 'PRIVATE-PROFILE', 'PRIVATE-USER', 'PRIVATE-CONTEXT', 'PRIVATE-ACTION']) {
      expect(JSON.stringify(event)).not.to.include(value);
      expect(JSON.stringify(redactForSiem(event, DEFAULT_SIEM_REDACTION))).not.to.include(value);
    }
  });

  for (const [occurredAt, expected] of [
    ['2026-10-14T10:00:00+10:00', '2026-10-14T00:00:00.000Z'],
    ['1970-01-01T00:00:00Z', '1970-01-01T00:00:00.000Z'],
    ['invaliddate', '2026-10-14T00:00:00.000Z'],
  ]) {
    it(`canonicalizes source timestamp ${occurredAt} before enqueueing`, async () => {
      sinon.useFakeTimers({ now: Date.parse('2026-10-14T00:00:00Z'), toFake: ['Date'] });
      await service.emitSecurityEvent({
        brandId: 'other-id',
        eventType: 'record.updated',
        category: 'recordLifecycle',
        source: 'RecordsService',
        occurredAt,
      });
      expect(queued).to.have.length(1);
      expect(queued[0].event.occurredAt).to.equal(expected);
    });
  }

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
