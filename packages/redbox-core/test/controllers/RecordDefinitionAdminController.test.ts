import { strict as assert } from 'node:assert';
import { Controllers } from '../../src/controllers/RecordDefinitionAdminController';
import { Services } from '../../src/services/RecordDefinitionAdminService';
import { RecordDefinitionDraftLifecycleError } from '../../src/services/RecordDefinitionDraftService';
import { routes } from '../../src/config/routes.config';
import { ControllerNames, ControllerExports } from '../../src/controllers';
import { coreRecordActionRegistry } from '../../src/services/record-actions/coordinator';

describe('B09 Admin HTTP boundary', () => {
  const globals = global as any;
  let previous: any;
  let calls: any[];
  let service: Services.RecordDefinitionAdmin;
  const request = (body: any = {}, overrides: any = {}) => ({
    brandId: 'brand-a',
    key: 'source',
    actor: { id: 'admin' },
    revision: '1',
    bindingId: '',
    parameter: '',
    body,
    query: {},
    ...overrides,
  });
  beforeEach(() => {
    previous = {
      BrandingService: globals.BrandingService,
      RecordDefinitionAdminService: globals.RecordDefinitionAdminService,
      RecordDefinitionDraftService: globals.RecordDefinitionDraftService,
      RecordDefinitionPublicationService: globals.RecordDefinitionPublicationService,
      sails: globals.sails,
    };
    calls = [];
    globals.sails = { config: { actionRegistry: coreRecordActionRegistry() }, log: { verbose() {} } };
    globals.BrandingService = {
      getBrand: (name: string) =>
        name === 'alpha' ? { id: 'brand-a', name: 'alpha' } : name === 'beta' ? { id: 'brand-b', name: 'beta' } : null,
    };
    service = new Services.RecordDefinitionAdmin();
    globals.RecordDefinitionAdminService = service;
    globals.RecordDefinitionPublicationService = { getRevision: async () => null };
    globals.RecordDefinitionDraftService = {
      list: async (...args: any[]) => {
        calls.push(args);
        return [];
      },
      getStatus: async () => null,
      get: async () => null,
      save: async (...args: any[]) => {
        calls.push(args);
        return { ok: false, conflict: { code: 'draft-version-conflict' } };
      },
    };
  });
  afterEach(() => Object.assign(globals, previous));
  async function controller(action = 'list', options: any = {}) {
    const req = {
      isAuthenticated: () => true,
      user: { id: 'admin', roles: [{ name: 'Admin', branding: 'brand-a' }] },
      params: { branding: 'alpha', portal: 'rdmp' },
      session: { branding: 'beta' },
      body: {},
      query: {},
      ...options,
    };
    let status = 200;
    let data: any;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(value: any) {
        data = value;
      },
      ok(value: any) {
        data = value;
      },
    };
    await (new Controllers.RecordDefinitionAdmin() as any)[action](req, res);
    return { status, data };
  }
  it('exports and routes exactly sixteen actions with CSRF enabled', () => {
    assert(ControllerNames.includes('RecordDefinitionAdminController'));
    const exports = ControllerExports.RecordDefinitionAdminController as object;
    const entries = Object.entries(routes).filter(
      ([, target]) => typeof target === 'object' && target.controller === 'RecordDefinitionAdminController'
    );
    assert.equal(entries.length, 16);
    for (const [path, target] of entries) {
      assert(path.includes('/:branding/:portal/admin/'));
      assert.equal((target as any).csrf, true);
      assert.equal(typeof (exports as any)[(target as any).action], 'function');
    }
    assert(!('handle' in exports));
    assert(!('respond' in exports));
  });
  it('rejects unauthenticated requests', async () => {
    assert.equal((await controller('list', { isAuthenticated: () => false })).status, 401);
    assert.equal(calls.length, 0);
  });
  for (const roles of [[], [{ name: 'Librarians', branding: 'brand-a' }], [{ name: 'Admin', branding: 'brand-b' }]]) {
    it(`rejects non-Admin or cross-brand roles ${JSON.stringify(roles)}`, async () => {
      assert.equal((await controller('list', { user: { id: 'user', roles } })).status, 403);
      assert.equal(calls.length, 0);
    });
  }
  it('resolves the route brand, ignoring session and body coordinates', async () => {
    assert.equal((await controller()).status, 200);
    assert.deepEqual(calls[0], ['brand-a', '']);
    assert.equal((await controller('list', { body: { brandId: 'brand-b' } })).status, 400);
    assert.equal((await controller('list', { params: { branding: 'absent' } })).status, 404);
  });
  it('accepts populated Admin branding relation', async () => {
    assert.equal(
      (await controller('list', { user: { id: 'admin', roles: [{ name: 'Admin', branding: { id: 'brand-a' } }] } }))
        .status,
      200
    );
  });
  for (const body of [
    [],
    'secret-sentinel',
    { surprise: 'secret-sentinel' },
    { schemaVersion: 1 },
    { schemaVersion: 1, expectedDraftVersion: '0', expectedActiveRevisionNumber: null },
  ]) {
    it(`rejects malformed/unknown discard body ${JSON.stringify(body)}`, async () => {
      const result = await service.handle('discard', request(body));
      assert.equal(result.status, 400);
      assert(!JSON.stringify(result).includes('secret-sentinel'));
    });
  }
  it('bounds bytes, string length, depth and query fields before service dispatch', async () => {
    assert.equal((await service.handle('save', request({ text: 's'.repeat(70_000) }))).status, 413);
    let deep: any = {};
    for (let i = 0; i < 40; i++) deep = { child: deep };
    assert.equal((await service.handle('save', request(deep))).status, 400);
    assert.equal((await service.handle('list', request({}, { query: { branding: 'brand-b' } }))).status, 400);
    assert.equal(calls.length, 0);
  });
  it('rejects malformed path keys and revisions', async () => {
    assert.equal((await service.handle('get', request({}, { key: '../bad' }))).status, 400);
    assert.equal((await service.handle('revision', request({}, { revision: '1e2' }))).status, 400);
  });
  it('accepts the full revision range without unsafe numeric coercion', async () => {
    assert.equal(
      (await service.handle('revision', request({}, { revision: String(Number.MAX_SAFE_INTEGER) }))).status,
      404
    );
    assert.equal(
      (await service.handle('revision', request({}, { revision: String(Number.MAX_SAFE_INTEGER + 1) }))).status,
      400
    );
  });
  it('returns only serialized descriptors without handlers', async () => {
    const result = await service.handle('actions', request());
    assert.equal(result.status, 200);
    assert(!JSON.stringify(result.data).includes('handler'));
    assert.deepEqual(
      (result.data as any).actions,
      JSON.parse(coreRecordActionRegistry().serializeDescriptorMetadata())
    );
  });
  it('normalizes failures outside the service, including brand lookup', async () => {
    globals.BrandingService.getBrand = () => {
      throw new Error('secret-sentinel');
    };
    assert.deepEqual(await controller(), { status: 500, data: { error: 'server-error' } });
  });
  it('never returns internal errors or exception messages', async () => {
    globals.RecordDefinitionDraftService.getStatus = async () => {
      throw new Error('secret-sentinel db internals');
    };
    assert.deepEqual(await service.handle('get', request()), { status: 500, data: { error: 'server-error' } });
    globals.RecordDefinitionDraftService.getStatus = async () => {
      throw new RecordDefinitionDraftLifecycleError('storage-consistency-error', 'secret-sentinel');
    };
    const result = await service.handle('get', request());
    assert.equal(result.status, 503);
    assert(!JSON.stringify(result).includes('secret-sentinel'));
  });
  it('rejects stale validation preconditions and delegates the authoritative check', async () => {
    globals.RecordDefinitionPublicationService = {
      validateDraft: async (...args: any[]) => {
        calls.push(args);
        return { ok: false, conflict: { code: 'identity-version-conflict' } };
      },
    };
    const body = {
      schemaVersion: 1,
      expectedIdentityVersion: 2,
      expectedDraftVersion: 3,
      expectedActiveRevisionNumber: 1,
    };
    assert.equal((await service.handle('validate', request(body))).status, 409);
    assert.deepEqual(calls[0], ['brand-a', 'source', body]);
  });
  it('rejects stale draft secret writes and requires explicit clear confirmation', async () => {
    globals.RecordDefinitionDraftService.get = async () => ({ version: 4 });
    const body = { schemaVersion: 1, expectedDraftVersion: 3, expectedSecretVersion: 0, value: 'secret-sentinel' };
    const result = await service.handle('writeSecret', request(body));
    assert.equal(result.status, 409);
    assert(!JSON.stringify(result).includes('secret-sentinel'));
    delete (body as any).value;
    assert.equal((await service.handle('clearSecret', request(body))).status, 400);
  });
});
