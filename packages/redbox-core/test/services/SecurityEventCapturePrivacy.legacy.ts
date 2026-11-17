// Explicit retained Express adapter cases, removed with FM-043.
const collaborators: any = {};
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import { installIdentityRepositoryMock } from '../helpers/identityMock';
import { expect } from 'chai';
import * as lodash from 'lodash';
import * as sinon from 'sinon';
import { Services as SecurityServices } from '../../src/services/SecurityEventService';
import { Services as RecordServices } from '../../src/services/RecordsService';
import { Services as UserServices } from '../../src/services/UsersService';
import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mountAuthenticationRoutes, authenticationFailureEvent } from '../../src/http/express/login';
import { httpErrorHandler } from '../../src/http/express/middleware';
import { createHttpPolicies } from '../../src/http/express/policies';
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

  async function authorize(req: Request, res: Response, authenticated: boolean) {
    const policies = createHttpPolicies({
      branding: { getBrand: async () => ({ id: 'other-id', name: 'other' }) },
      portals: ['rdmp'],
      pathRules: { getRulesFromPath: () => [{}] as any, canRead: () => false },
      defaultUnauthenticatedRole: () => ({}),
      authenticate: async () => (authenticated ? { id: 'u1', username: 'alice', roles: [] } : false),
      emitRequestFailure: async (request, eventType, source) => {
        await service.emitSecurityEvent({
          brandId: 'other-id',
          portalId: 'rdmp',
          eventType,
          category: 'authorization',
          source,
          requestContext: { method: request.method, path: request.path },
        });
      },
    });
    await policies.brandingandportal(req, res, () => {});
    await policies.checkauth(req, res, () => {});
  }
  async function loginRequest(path: string, body: any = {}, mode = 'denied', brand = 'other') {
    const app = express();
    app.use(express.json());
    const actor = {
      id: 'u1',
      username: 'someone',
      email: 'private@example.test',
      roles: [{ id: 'role', brandId: `${brand}-id` }],
    };
    const users = new UserServices.Users({
      repository: getIdentityRepositories(),
      accounts: {} as any,
      log: collaborators.environment.log,
      defaultBrand: () => ({ id: `${brand}-id`, name: brand }) as any,
      emitSecurityEvent: (...args) => service.emitFromUserAudit(...args),
    });
    app.use((req, _res, next) => {
      req.session = {
        branding: brand,
        portal: 'rdmp',
        save: done => done(mode === 'save-failure' ? new Error('session write failed') : undefined),
        destroy: done => done(),
      } as any;
      req.logIn = ((_user, done) => done(mode === 'session-failure' ? new Error('session failed') : undefined)) as any;
      req.logout = ((done: () => void) => done()) as any;
      req.user = actor;
      next();
    });
    mountAuthenticationRoutes(app, {
      passport: {
        authenticate: (_strategy, callback) => (_req, _res, _next) => callback(null, mode === 'denied' ? false : actor),
      } as any,
      identity: { session: async () => actor, profile: async () => actor } as any,
      defaultBrand: 'default',
      defaultPortal: 'rdmp',
      validContext: () => true,
      brandId: name => `${name}-id`,
      postLoginPath: () => '/home',
      csrf: (_req, _res, next) => next(),
      audit: async (action, user, req) => {
        await users.addUserAuditEvent(
          user,
          action,
          new RequestDetails(req, { brandId: `${brand}-id`, portalId: 'rdmp' })
        );
      },
      loginFailure: req =>
        service.emitSecurityEvent(authenticationFailureEvent(req, { brandId: `${brand}-id`, portalId: 'rdmp' })),
    });
    app.use(httpErrorHandler(collaborators.environment.log));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
        method: path.includes('oidc') ? 'GET' : 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        ...(path.includes('oidc') ? {} : { body: JSON.stringify({ ...body, branding: brand, portal: 'rdmp' }) }),
      });
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  it('captures failed authentication and authorization denial through actual HTTP/policy owners', async () => {
    await loginRequest('/user/login_local', { username: 'alice', password: 'PRIVATE-PASSWORD' });
    expect(queued[0].event.eventType).to.equal('authentication.login.failure');
    expect(queued[0].event.brandId).to.equal('other-id');
    expect(queued[0].event.subject).to.deep.equal({ username: 'alice' });
    expect(JSON.stringify(queued[0])).not.to.include('PRIVATE-PASSWORD');
    expect(queued[0].event).not.to.have.property('body');
    await loginRequest('/user/login_oidc');
    await loginRequest('/user/login_aaf', { assertion: 'controlled-assertion' });
    expect(queued).to.have.length(3);
    expect(queued.every(item => item.event.eventType === 'authentication.login.failure')).to.equal(true);
    const req = Object.assign(request('other'), { user: { id: 'u1' } });
    const response = responseFixture();
    await authorize(req, response, true);
    expect(queued[3].event.eventType).to.equal('authorization.failure');
    expect(response.status.calledWith(403)).to.equal(true);
  });

  it('skips routine browser login redirects while retaining unauthenticated API denials', async () => {
    const req = request('other');
    const response = responseFixture();
    for (let i = 0; i < 20; i++) await authorize(req, response, false);
    expect(response.redirect.callCount).to.equal(20);
    expect(queued).to.have.length(0);
    req.headers['content-type'] = 'application/json';
    await authorize(req, response, false);
    expect(response.status.calledWith(403)).to.equal(true);
    expect(queued).to.have.length(1);
    expect(queued[0].event.eventType).to.equal('authorization.failure');
  });

  for (const username of [{ password: 'PRIVATE-PASSWORD' }, ['alice'], 42, null]) {
    it(`omits a non-string local login username (${JSON.stringify(username)})`, async () => {
      expect((await loginRequest('/user/login_local', { username, password: 'PRIVATE-PASSWORD' })).status).to.equal(
        400
      );
      expect(queued).to.have.length(1);
      expect(queued[0].event.subject).to.equal(undefined);
      expect(JSON.stringify(queued)).not.to.include('PRIVATE-PASSWORD');
    });
  }

  it('emits successful login/logout only after session success and keeps their request brands', async () => {
    await loginRequest('/user/login_local', { username: 'someone', password: 'secret' }, 'success');
    await loginRequest('/default/rdmp/user/logout', {}, 'success', 'default');
    expect(queued.map(item => item.event.brandId)).to.deep.equal(['other-id', 'default-id']);
    expect(queued.map(item => item.event.eventType)).to.deep.equal([
      'authentication.login.success',
      'authentication.logout.success',
    ]);
    await loginRequest('/user/login_local', { username: 'someone', password: 'secret' }, 'session-failure');
    expect(queued).to.have.length(3);
    expect(queued[2].event.eventType).to.equal('authentication.login.failure');
  });

  it('emits no login success when final session persistence fails', async () => {
    expect(
      (await loginRequest('/user/login_local', { username: 'someone', password: 'secret' }, 'save-failure')).status
    ).to.equal(500);
    expect(queued.map(item => item.event.eventType)).to.deep.equal(['authentication.login.failure']);
  });

});
