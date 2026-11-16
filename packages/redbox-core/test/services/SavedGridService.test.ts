import assert from 'node:assert/strict';
import { of } from 'rxjs';
import { ObjectId } from 'mongodb';
import { Services, SavedGridError, savedGridDefinition } from '../../src/services/SavedGridService';
import type { BuildResponseType } from '../../src/model';
import { namedQueryMutationCsrf } from '../../src/policies/namedQueryMutationCsrf';
import { savedGridContext, Controllers } from '../../src/controllers/SavedGridController';
import { ControllerExports, ControllerNames } from '../../src/controllers';
import { WaterlineModels } from '../../src/waterline-models';
import { ServiceExports } from '../../src/services';
import { policies } from '../../src/config/policies.config';
const scope = { brandId: 'brand-a', portal: 'one' };
const definition = () => ({
  version: 1 as const,
  name: 'Plans',
  recordType: 'plan',
  columns: ['metadata:/title'],
  filters: [],
  sort: null,
  pageSize: 25 as const,
});
type Row = {
  _id: ObjectId;
  brandId: string;
  portal: string;
  revision: number;
  definition: ReturnType<typeof definition>;
};
const originals = new Map<string, unknown>();
const setGlobal = (key: string, value: unknown) => {
  if (!originals.has(key)) originals.set(key, Reflect.get(globalThis, key));
  Reflect.set(globalThis, key, value);
};
describe('Saved grids persistence boundary', () => {
  let service: Services.SavedGrids;
  let rows: Row[];
  let fields: object[];
  let discoveredCaller: unknown;
  const matches = (row: Row, criteria: object) =>
    Object.entries(criteria).every(([key, value]) =>
      key === '_id' && value && typeof value === 'object' && '$gt' in value
        ? String(row._id) > String(value.$gt)
        : String(Reflect.get(row, key)) === String(value)
    );
  beforeEach(() => {
    rows = [];
    fields = [
      {
        id: 'metadata:/title',
        scalarType: 'STRING',
        selectable: true,
        repeating: false,
        availableInAllVariants: true,
        operators: ['EQ', 'CONTAINS', 'IN', 'EXISTS'],
        sortable: true,
      },
    ];
    const collection = {
      insertOne: async (row: Row) => {
        rows.push(row);
      },
      find: (criteria: object) => ({
        sort: () => ({
          limit: (limit: number) => ({
            toArray: async () => rows.filter(row => matches(row, criteria)).slice(0, limit),
          }),
        }),
      }),
      findOne: async (criteria: object) => rows.find(row => matches(row, criteria)) ?? null,
      findOneAndUpdate: async (criteria: object, update: { $set: object }) => {
        const row = rows.find(row => matches(row, criteria));
        if (!row) return null;
        Object.assign(row, update.$set);
        return row;
      },
      deleteOne: async (criteria: object) => {
        const index = rows.findIndex(row => matches(row, criteria));
        if (index < 0) return { deletedCount: 0 };
        rows.splice(index, 1);
        return { deletedCount: 1 };
      },
    };
    setGlobal('SavedGrid', {
      tableName: 'savedgrid',
      getDatastore: () => ({ manager: { collection: () => collection }, driver: { mongodb: { ObjectId } } }),
    });
    setGlobal('RecordGraphqlService', {
      execute: async (caller: unknown) => {
        discoveredCaller = caller;
        return { status: 200, data: { data: { recordFields: { fields } } } };
      },
    });
    service = new Services.SavedGrids();
  });
  afterEach(() => {
    for (const [key, value] of originals) Reflect.set(globalThis, key, value);
    originals.clear();
  });
  it('saves and reopens declared repeating columns without scalar filter/sort capabilities', async () => {
    fields.push({
      id: 'metadata:/people',
      scalarType: 'JSON',
      selectable: true,
      repeating: true,
      availableInAllVariants: true,
      operators: [],
      sortable: false,
    });
    const grid = { ...definition(), columns: ['metadata:/people'] };
    const saved = await service.create(scope, grid, {});
    assert.deepEqual((await service.read(scope, saved.id)).columns, grid.columns);
    await assert.rejects(
      service.create(
        scope,
        { ...grid, sort: { fieldId: 'metadata:/people', direction: 'asc', expectedScalarType: 'STRING' } },
        {}
      )
    );
    await assert.rejects(
      service.create(
        scope,
        {
          ...grid,
          filters: [{ fieldId: 'metadata:/people', operator: 'eq', values: ['x'], expectedScalarType: 'STRING' }],
        },
        {}
      )
    );
  });
  it('saves declared single-person objects but rejects scalar operations and opaque objects', async () => {
    const id = 'metadata:/contributor_ci';
    fields.push({
      id,
      scalarType: 'OBJECT',
      selectable: true,
      repeating: false,
      availableInAllVariants: true,
      operators: [],
      sortable: false,
    });
    const grid = { ...definition(), columns: [id] };
    const saved = await service.create(scope, grid, {});
    assert.deepEqual((await service.read(scope, saved.id)).columns, [id]);
    await assert.rejects(
      service.create(scope, { ...grid, sort: { fieldId: id, direction: 'asc', expectedScalarType: 'STRING' } }, {})
    );
    await assert.rejects(
      service.create(
        scope,
        { ...grid, filters: [{ fieldId: id, operator: 'eq', values: ['x'], expectedScalarType: 'STRING' }] },
        {}
      )
    );
    fields = [{ id, scalarType: 'OBJECT', selectable: false }];
    await assert.rejects(service.create(scope, grid, {}));
  });
  it('persists explicit GraphQL definitions only after the parent read executor accepts them', async () => {
    const raw = {
      version: 1,
      mode: 'graphql',
      name: 'Raw plans',
      document: 'query Read($after: String) { records(recordType:"plan",after:$after) { nodes { oid } } }',
      variables: { after: null },
      resultPath: ['records', 'nodes'],
    };
    let received: unknown;
    setGlobal('RecordGraphqlService', {
      execute: async (caller: unknown, body: unknown) => {
        received = { caller, body };
        return { status: 200, data: { data: { records: { nodes: [] } } } };
      },
    });
    const caller = { user: 'admin' };
    const saved = await service.create(scope, raw, caller);
    await assert.rejects(
      service.create(
        scope,
        { ...raw, document: raw.document.replace('$after: String', '$after: String = \"cursor-default\"') },
        caller
      ),
      (e: SavedGridError) => e.code === 'invalid-document'
    );
    assert.equal(saved.mode, 'graphql');
    assert.deepEqual(received, { caller, body: { query: raw.document, variables: raw.variables } });
    assert.deepEqual(await service.read(scope, saved.id), saved);
    const changed = await service.update(scope, saved.id, 1, { ...raw, name: 'Changed' }, caller);
    assert.equal(changed.revision, 2);
    await assert.rejects(
      service.update(scope, saved.id, 1, raw, caller),
      (e: SavedGridError) => e.code === 'revision-conflict'
    );
    await assert.rejects(
      service.create(scope, { ...raw, variables: { after: 'result-cursor' } }, caller),
      (e: SavedGridError) => e.code === 'invalid-document'
    );
    await assert.rejects(
      service.create(scope, { ...raw, resultPath: ['bad.path'] }, caller),
      (e: SavedGridError) => e.code === 'invalid-definition'
    );
    await assert.rejects(
      service.create(scope, { ...raw, extra: true }, caller),
      (e: SavedGridError) => e.code === 'invalid-definition'
    );
    setGlobal('RecordGraphqlService', {
      execute: async () => ({ status: 200, data: { errors: [{ message: 'rejected' }] } }),
    });
    await assert.rejects(service.create(scope, raw, caller), (e: SavedGridError) => e.code === 'invalid-document');
    setGlobal('RecordGraphqlService', { execute: async () => ({ status: 403, data: {} }) });
    await assert.rejects(service.create(scope, raw, caller), (e: SavedGridError) => e.code === 'auth-required');
  });
  it('rejects excessive variable depth before create/update and leaves catalogue rows readable', async () => {
    setGlobal('RecordGraphqlService', { execute: async () => ({ status: 200, data: { data: {} } }) });
    const nested = (depth: number, array: boolean) => {
      let value: unknown = 'leaf';
      for (let i = 0; i < depth; i++) value = array ? [value] : { nested: value };
      return value;
    };
    for (const array of [false, true]) {
      const raw = {
        version: 1,
        mode: 'graphql',
        name: 'Bounded',
        document: '{ __typename }',
        variables: { extra: nested(30, array) },
        resultPath: [],
      };
      const saved = await service.create(scope, raw, {});
      const before = rows.length;
      for (const depth of [31, 32, 1000]) {
        const invalid = { ...raw, variables: { extra: nested(depth, array) } };
        await assert.rejects(
          service.create(scope, invalid, {}),
          (e: SavedGridError) => e.code === 'invalid-definition'
        );
        await assert.rejects(
          service.update(scope, saved.id, 1, invalid, {}),
          (e: SavedGridError) => e.code === 'invalid-definition'
        );
      }
      assert.equal(rows.length, before);
      assert.equal((await service.read(scope, saved.id)).revision, 1);
      for (const { id, revision, updatedAt, updatedBy, ...stored } of (await service.list(scope)).grids)
        assert.ok(savedGridDefinition.safeParse(stored).success);
      assert.equal((await service.list(scope)).grids.length, before);
    }
  });
  it('exposes bounded actual schema tooling and handles missing schema safely', async () => {
    const caller = { user: 'admin' };
    let received: unknown;
    setGlobal('RecordGraphqlService', {
      describeReadSchema: async (value: unknown) => {
        received = value;
        return 'type Query { record: String }';
      },
    });
    assert.equal((await service.schema(caller)).sdl, 'type Query { record: String }');
    assert.equal(received, caller);
    setGlobal('RecordGraphqlService', { describeReadSchema: async () => 'x'.repeat(262145) });
    await assert.rejects(service.schema(caller), (e: SavedGridError) => e.code === 'schema-unavailable');
  });
  it('registers model, service, controller and browser CSRF policy', () => {
    assert.ok(WaterlineModels.SavedGrid);
    assert.ok(ServiceExports.SavedGridService);
    assert.ok(ControllerExports.SavedGridController);
    assert.ok(ControllerNames.includes('SavedGridController'));
    assert.ok(JSON.stringify(policies.SavedGridController).includes('namedQueryMutationCsrf'));
    assert.ok(!JSON.stringify(policies.SavedGridController).includes('isWebServiceAuthenticated'));
  });
  it('persists stable IDs across fresh services and isolates brand and portal', async () => {
    const caller = { user: 'current' };
    const saved = await service.create(scope, definition(), caller);
    assert.equal(discoveredCaller, caller);
    assert.match(saved.id, /^[a-f0-9]{24}$/);
    assert.deepEqual(await new Services.SavedGrids().read(scope, saved.id), saved);
    assert.deepEqual(await service.list({ ...scope, portal: 'two' }), { grids: [], next: null });
    assert.deepEqual(await service.list({ ...scope, brandId: 'brand-b' }), { grids: [], next: null });
    await assert.rejects(service.read({ ...scope, portal: 'two' }, saved.id), (e: SavedGridError) => e.status === 404);
    await assert.rejects(
      service.update({ ...scope, brandId: 'brand-b' }, saved.id, 1, definition(), caller),
      (e: SavedGridError) => e.status === 404
    );
    await assert.rejects(
      service.remove({ ...scope, portal: 'two' }, saved.id, 1),
      (e: SavedGridError) => e.status === 404
    );
    assert.equal(rows.length, 1);
  });
  it('admits only one update from simultaneous editors and checks delete revisions', async () => {
    const saved = await service.create(scope, definition(), {});
    const results = await Promise.allSettled([
      service.update(scope, saved.id, 1, { ...definition(), name: 'First' }, {}),
      service.update(scope, saved.id, 1, { ...definition(), name: 'Second' }, {}),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failed = results.find(result => result.status === 'rejected');
    assert.equal(failed?.status === 'rejected' && failed.reason.code, 'revision-conflict');
    await assert.rejects(service.remove(scope, saved.id, 1), (e: SavedGridError) => e.status === 409);
    await service.remove(scope, saved.id, 2);
    await assert.rejects(service.read(scope, saved.id), (e: SavedGridError) => e.status === 404);
  });
  it('rejects extra properties, fragments, cursors and excessive UTF-8 operands and arrays', async () => {
    for (const invalid of [
      { ...definition(), after: 'cursor' },
      { ...definition(), query: '{ records { oid } }' },
      { ...definition(), columns: Array(31).fill('metadata:/title') },
      {
        ...definition(),
        sort: { fieldId: 'metadata:/title', expectedScalarType: 'INTEGER', direction: 'asc', fragment: 'raw' },
      },
      {
        ...definition(),
        filters: [
          { fieldId: 'metadata:/title', expectedScalarType: 'INTEGER', operator: 'in', values: Array(21).fill('x') },
        ],
      },
      {
        ...definition(),
        filters: [
          { fieldId: 'metadata:/title', expectedScalarType: 'INTEGER', operator: 'eq', values: ['😀'.repeat(65)] },
        ],
      },
      {
        ...definition(),
        filters: [{ fieldId: 'metadata:/title', expectedScalarType: 'INTEGER', operator: 'exists', values: ['yes'] }],
      },
    ]) {
      assert.equal(savedGridDefinition.safeParse(invalid).success, false);
      await assert.rejects(service.create(scope, invalid, {}), (e: SavedGridError) => e.code === 'invalid-definition');
    }
    assert.equal(rows.length, 0);
  });
  it('revalidates current capabilities and blocks partial discovery responses', async () => {
    fields = [];
    await assert.rejects(service.create(scope, definition(), {}), (e: SavedGridError) => e.code === 'schema-changed');
    setGlobal('RecordGraphqlService', {
      execute: async () => ({
        status: 200,
        data: { errors: [{ message: 'private' }], data: { recordFields: { fields: [] } } },
      }),
    });
    await assert.rejects(service.create(scope, definition(), {}), SavedGridError);
    assert.equal(rows.length, 0);
  });
  it('rejects bad scalar operands and unsupported operations when bypassing UI', async () => {
    fields = [
      {
        id: 'metadata:/title',
        scalarType: 'INTEGER',
        selectable: true,
        repeating: false,
        availableInAllVariants: true,
        operators: ['EQ', 'BETWEEN'],
        sortable: true,
      },
    ];
    for (const values of [['Infinity'], ['0x10'], ['1.1'], ['9007199254740992']]) {
      await assert.rejects(
        service.create(
          scope,
          {
            ...definition(),
            filters: [{ fieldId: 'metadata:/title', expectedScalarType: 'INTEGER', operator: 'eq', values }],
          },
          {}
        ),
        SavedGridError
      );
    }
    await assert.rejects(
      service.create(
        scope,
        {
          ...definition(),
          filters: [
            { fieldId: 'metadata:/title', expectedScalarType: 'INTEGER', operator: 'between', values: ['5', '1'] },
          ],
        },
        {}
      ),
      SavedGridError
    );
    await assert.rejects(
      service.create(
        scope,
        {
          ...definition(),
          filters: [{ fieldId: 'metadata:/title', expectedScalarType: 'INTEGER', operator: 'contains', values: ['x'] }],
        },
        {}
      ),
      SavedGridError
    );
  });
  it('requires route-brand Admin browser session and ignores session scope hints', () => {
    setGlobal('BrandingService', { getBrand: (name: string) => (name === 'a' ? { id: 'brand-a' } : undefined) });
    setGlobal('RolesService', { getAdmin: () => ({ id: 'admin-a' }) });
    const req = {
      params: { branding: 'a', portal: 'one' },
      session: { branding: 'b', portal: 'two' },
      user: { roles: [{ id: 'admin-a' }] },
      isAuthenticated: () => true,
    };
    assert.deepEqual(savedGridContext(req as unknown as Sails.Req).scope, scope);
    for (const invalid of [
      { ...req, isAuthenticated: () => false },
      { ...req, user: { roles: [{ id: 'admin-b' }] } },
      { ...req, user: { roles: [] } },
      { ...req, params: { branding: 'b', portal: 'one' } },
    ]) {
      assert.throws(
        () => savedGridContext(invalid as unknown as Sails.Req),
        (e: SavedGridError) => e.status === 403
      );
    }
  });
  it('rejects malformed transport bodies and maps revision conflicts without exception details', async () => {
    setGlobal('BrandingService', { getBrand: () => ({ id: 'brand-a' }) });
    setGlobal('RolesService', { getAdmin: () => ({ id: 'admin-a' }) });
    setGlobal('SavedGridService', service);
    class CaptureController extends Controllers.SavedGrid {
      response?: BuildResponseType;
      protected override sendResp(_req: Sails.Req, res: Sails.Res, response?: BuildResponseType) {
        this.response = response;
        return res;
      }
    }
    const controller = new CaptureController();
    const req = {
      params: { branding: 'a', portal: 'one' },
      user: { roles: [{ id: 'admin-a' }] },
      isAuthenticated: () => true,
      body: { definition: definition(), brandId: 'other-brand' },
    };
    const res = {} as Sails.Res;
    await controller.create(req as unknown as Sails.Req, res);
    assert.equal(controller.response?.status, 400);
    assert.equal(rows.length, 0);
    const saved = await service.create(scope, definition(), {});
    await service.update(scope, saved.id, 1, definition(), {});
    await controller.update(
      {
        ...req,
        params: { ...req.params, gridId: saved.id },
        body: { definition: definition(), revision: 1 },
      } as unknown as Sails.Req,
      res
    );
    assert.equal(controller.response?.status, 409);
    assert.equal(controller.response?.displayErrors?.[0]?.code, 'revision-conflict');
    assert.equal(controller.response?.headers?.['Cache-Control'], 'no-store');
  });
  it('requires a valid CSRF token for browser mutations', () => {
    let status = 0,
      passed = false;
    const req = { method: 'POST', isAuthenticated: () => true, session: {}, headers: {}, csrfToken: () => '' };
    const res = {
      status: (value: number) => {
        status = value;
        return res;
      },
      json: () => res,
    };
    namedQueryMutationCsrf(req as unknown as Sails.Req, res as unknown as Sails.Res, () => {
      passed = true;
    });
    assert.equal(status, 403);
    assert.equal(passed, false);
    req.headers = { 'x-csrf-token': req.csrfToken() };
    namedQueryMutationCsrf(req as unknown as Sails.Req, res as unknown as Sails.Res, () => {
      passed = true;
    });
    assert.equal(passed, true);
  });
  it('rejects saved NUMBER-to-STRING filter drift until the request explicitly repairs its binding', async () => {
    const numeric = {
      ...definition(),
      filters: [{ fieldId: 'metadata:/title', expectedScalarType: 'NUMBER', operator: 'eq', values: ['1.0'] }],
    };
    fields = [
      {
        id: 'metadata:/title',
        scalarType: 'NUMBER',
        selectable: true,
        repeating: false,
        availableInAllVariants: true,
        operators: ['EQ'],
        sortable: true,
      },
    ];
    const saved = await service.create(scope, numeric, {});
    assert.equal(saved.filters[0].expectedScalarType, 'NUMBER');
    fields = [{ ...fields[0], scalarType: 'STRING' }];
    await assert.rejects(
      service.update(scope, saved.id, 1, numeric, {}),
      (e: SavedGridError) => e.code === 'filter-type-changed'
    );
    const legacy = { ...numeric, filters: [{ fieldId: 'metadata:/title', operator: 'eq', values: ['1.0'] }] };
    await assert.rejects(service.create(scope, legacy, {}), (e: SavedGridError) => e.code === 'filter-type-changed');
    const repaired = { ...numeric, filters: [{ ...numeric.filters[0], expectedScalarType: 'STRING' }] };
    assert.equal((await service.update(scope, saved.id, 1, repaired, {})).revision, 2);
  });
  it('uses the collection timestamp grammar for both create and update', async () => {
    fields = [
      {
        id: 'metadata:/title',
        scalarType: 'DATETIME',
        selectable: true,
        repeating: false,
        availableInAllVariants: true,
        operators: ['EQ'],
        sortable: true,
      },
    ];
    const grid = (value: string) => ({
      ...definition(),
      filters: [{ fieldId: 'metadata:/title', expectedScalarType: 'DATETIME', operator: 'eq', values: [value] }],
    });
    const saved = await service.create(scope, grid('2026-01-01T00:00:00.123Z'), {});
    for (const invalid of [
      '2026-01-01T00:00:00.1234Z',
      '2026-02-30T00:00:00Z',
      '0001-01-01T00:00:00+01:00',
      '9999-12-31T23:59:59-01:00',
      '2026-01-01T00:00:00',
    ]) {
      await assert.rejects(
        service.create(scope, grid(invalid), {}),
        (e: SavedGridError) => e.code === 'invalid-definition'
      );
      await assert.rejects(
        service.update(scope, saved.id, 1, grid(invalid), {}),
        (e: SavedGridError) => e.code === 'invalid-definition'
      );
    }
    assert.equal((await service.read(scope, saved.id)).revision, 1);
    assert.equal((await service.update(scope, saved.id, 1, grid('2028-02-29t12:00:00.1z'), {})).revision, 2);
  });
  it('paginates beyond 500 saved grids while keeping every entry readable and deletable', async () => {
    for (let index = 0; index < 501; index++)
      rows.push({ _id: new ObjectId(), ...scope, revision: 1, definition: definition() });
    const created = await service.create(scope, definition(), {});
    const ids: string[] = [];
    let after: string | undefined;
    do {
      const page = await service.list(scope, after);
      assert.ok(page.grids.length <= 100);
      ids.push(...page.grids.map(grid => grid.id));
      after = page.next ?? undefined;
    } while (after);
    assert.equal(ids.length, 502);
    assert.equal(new Set(ids).size, 502);
    assert.equal(ids[501], created.id);
    assert.equal((await service.read(scope, created.id)).id, created.id);
    await service.remove(scope, created.id, 1);
    assert.equal(rows.length, 501);
  });
  it('discovers configured hidden and overridden stage names without touching GraphQL field discovery', async () => {
    setGlobal('RecordTypesService', { get: () => of({ id: 'plan' }) });
    setGlobal('WorkflowStepsService', {
      getAllForRecordTypeIncludingHidden: () =>
        of([
          { name: 'draft', config: { form: 'plan' } },
          { name: 'hidden-step', hidden: true, config: { form: 'plan', workflow: { stage: 'review' } } },
          { name: 'unconfigured', config: { form: 'missing' } },
        ]),
    });
    setGlobal('FormsService', { listForms: () => of([{ name: 'plan', branding: 'brand-a', configuration: {} }]) });
    setGlobal('RecordGraphqlService', {
      execute: () => {
        throw new Error('CATALOGUE_LIMIT: >1000 fields');
      },
    });
    const caller = { brand: { id: 'brand-a' }, portal: 'one', user: {}, roles: [] };
    assert.deepEqual(await service.stages(caller, 'plan'), { stages: ['draft', 'review'] });
    setGlobal('RecordTypesService', { get: () => of(null) });
    await assert.rejects(service.stages(caller, 'unknown'), (e: SavedGridError) => e.status === 404);
  });
  it('rejects NUMBER-to-STRING sort drift on create/update until explicitly repaired', async () => {
    fields = [
      {
        id: 'metadata:/title',
        scalarType: 'NUMBER',
        selectable: true,
        repeating: false,
        availableInAllVariants: true,
        operators: ['EQ'],
        sortable: true,
      },
    ];
    const numeric = {
      ...definition(),
      sort: { fieldId: 'metadata:/title', direction: 'asc', expectedScalarType: 'NUMBER' },
    };
    const saved = await service.create(scope, numeric, {});
    assert.equal(saved.sort?.expectedScalarType, 'NUMBER');
    fields = [{ ...fields[0], scalarType: 'STRING' }];
    await assert.rejects(service.create(scope, numeric, {}), (e: SavedGridError) => e.code === 'sort-type-changed');
    await assert.rejects(
      service.update(scope, saved.id, 1, numeric, {}),
      (e: SavedGridError) => e.code === 'sort-type-changed'
    );
    const legacy = { ...numeric, sort: { fieldId: 'metadata:/title', direction: 'asc' } };
    await assert.rejects(
      service.update(scope, saved.id, 1, legacy, {}),
      (e: SavedGridError) => e.code === 'sort-type-changed'
    );
    const repaired = { ...numeric, sort: { ...numeric.sort, expectedScalarType: 'STRING' } };
    assert.equal((await service.update(scope, saved.id, 1, repaired, {})).sort?.expectedScalarType, 'STRING');
  });
});
