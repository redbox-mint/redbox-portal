import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { ConfigService, CsrfInterceptor, TranslationService, UtilityService } from '@researchdatabox/portal-ng-common';
import { RecordGridService } from './record-grid.service';
import { GridRequestError, GridSourceUnavailable } from './data-grid-source';
import { emptyGrid, GridCatalogue, GridPage, GridQuery, GridScope, queryFor } from './data-grid.model';
import {
  collectionRequest,
  discoveryQuery,
  parseDiscovery,
  parsePage,
  parseSavedDefinition,
  parseSavedQuery,
  scopeId,
} from './record-grid.protocol';

const title = {
  id: 'metadata:/title',
  label: 'title',
  labelKey: '@title',
  scalarType: 'STRING',
  repeating: false,
  selectable: true,
  availableInAllVariants: true,
  filterable: true,
  operators: ['EQ', 'CONTAINS', 'IN', 'EXISTS'],
  sortable: true,
  choices: [{ label: 'Suggested', value: 'suggested' }],
  selections: [
    { variant: 'M_draft', selection: '... on M_draft { g_title: title }', responsePath: ['metadata', 'g_title'] },
  ],
};
const oid = {
  ...title,
  id: 'record:oid',
  labelKey: null,
  selections: [{ variant: '', selection: 'oid', responsePath: ['oid'] }],
};
const discovery = (fields = [title, oid], revision = 'r1') => ({
  revision,
  variants: [{ workflowStage: 'draft' }, { workflowStage: 'review' }],
  fields,
});
const scope: GridScope = { id: scopeId('plan'), recordType: 'plan', label: 'plan', fields: [] };
function request(): GridQuery {
  const found = parseDiscovery(discovery(), key => (key === '@title' ? 'Title' : key));
  return queryFor(
    {
      ...emptyGrid(),
      name: 'Plans',
      recordType: 'plan',
      columns: [title.id, oid.id],
      filters: [
        { fieldId: title.id, expectedScalarType: 'STRING' as const, operator: 'contains', values: ['x" } injected {'] },
      ],
      sort: { fieldId: title.id, expectedScalarType: 'STRING' as const, direction: 'desc' },
    },
    { ...scope, fields: found.fields, revision: found.revision },
    null
  );
}

describe('RecordGridService HTTP contract', () => {
  let service: RecordGridService;
  let http: HttpTestingController;
  const url = '/context/brand/portal/api/graphql';
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        RecordGridService,
        { provide: APP_BASE_HREF, useValue: '/context' },
        { provide: UtilityService, useValue: { waitForDependencies: async () => undefined } },
        {
          provide: ConfigService,
          useValue: {
            csrfToken: 'current-token',
            getConfig: async () => ({ baseUrl: '', branding: 'brand', portal: 'portal', csrfToken: 'old-token' }),
          },
        },
        { provide: TranslationService, useValue: { t: (key: string) => (key === '@title' ? 'Title' : key) } },
        { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
      ],
    });
    service = TestBed.inject(RecordGridService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('prepares a detached named query using a scoped CSRF POST body and no values in the URL', fakeAsync(() => {
    const input = { ...request().definition, name: 'Current unsaved explorer' };
    let result: unknown;
    service.prepareNamedQuery(input).then(value => (result = value));
    flushMicrotasks();
    const req = http.expectOne('/context/brand/portal/api/named-query/editor/from-explorer');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('current-token');
    expect(req.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    expect(req.request.body).toEqual({ exploration: input });
    expect(req.request.body.exploration).not.toBe(input);
    const prepared = {
      definition: {
        source: 'graphql',
        name: '',
        graphql: { document: 'query { __typename }', variables: {}, resultPath: [], mappings: {} },
      },
      variableValues: { current: [false, 0] },
    };
    req.flush({ data: prepared });
    flushMicrotasks();
    expect(result).toEqual(prepared);
    expect(result).not.toBe(prepared);
    http.expectNone('/context/brand/portal/app/data-grids');
  }));

  for (const wrapped of [true, false]) {
    it(`discovers record types from the ${wrapped ? 'wrapped' : 'direct'} REST response with persistence and without eager field calls`, fakeAsync(() => {
      let result: GridCatalogue | undefined;
      service.catalogue().then(value => (result = value));
      flushMicrotasks();
      const req = http.expectOne('/context/brand/portal/api/recordtypes');
      expect(req.request.headers.get('X-CSRF-Token')).toBe('current-token');
      const data = { records: [{ name: 'plan' }] };
      req.flush(wrapped ? { data } : data);
      flushMicrotasks();
      expect(result).toEqual({ scopes: [scope], persistence: true });
      http.expectNone(url);
    }));
  }
  it('loads stage choices independently before an all-stage CATALOGUE_LIMIT failure', fakeAsync(() => {
    let stages: GridScope[] = [],
      error: GridRequestError | undefined;
    service.stages(scope).then(value => (stages = value));
    flushMicrotasks();
    http.expectOne('/context/brand/portal/app/data-grids/scopes/plan').flush({ data: { stages: ['draft', 'review'] } });
    flushMicrotasks();
    expect(stages.map(scope => scope.workflowStage)).toEqual(['draft', 'review']);
    service.fields(scope).catch(value => (error = value));
    flushMicrotasks();
    http.expectOne(url).flush({ errors: [{ extensions: { code: 'CATALOGUE_LIMIT' } }] });
    flushMicrotasks();
    expect(error?.key).toBe('catalogue-limit');
    service.fields(stages[0]).then(() => undefined);
    flushMicrotasks();
    const narrowed = http.expectOne(url);
    expect(narrowed.request.body.variables.stages).toEqual(['draft']);
    narrowed.flush({ data: { recordFields: discovery() } });
    flushMicrotasks();
  }));
  it('generates executable GraphQL from fresh discovery without changing visual semantics', fakeAsync(() => {
    const input = request();
    let generated: { query: string; variables: object } | undefined;
    service.generate(input).then(value => (generated = value));
    flushMicrotasks();
    const lookup = http.expectOne(url);
    expect(lookup.request.body.variables.ids).toEqual([title.id, oid.id]);
    lookup.flush({ data: { recordFields: discovery() } });
    flushMicrotasks();
    const expected = collectionRequest(
      input,
      scope,
      parseDiscovery(discovery(), key => key)
    );
    expect(generated).toEqual(expected);
    expect(generated?.query).toContain(title.selections[0].selection);
    expect(generated?.query).not.toContain('injected');
  }));
  it('loads actual scoped SDL and executes raw documents/variables with session CSRF', fakeAsync(() => {
    let sdl: string | undefined, data: unknown;
    service.schema().then(value => (sdl = value));
    flushMicrotasks();
    http.expectOne('/context/brand/portal/app/data-grids/schema').flush({ data: { sdl: 'type Query { oid: ID }' } });
    flushMicrotasks();
    expect(sdl).toContain('type Query');
    service.raw('query Read($oid: ID!) { record(oid:$oid) { oid } }', { oid: 'abc' }).then(value => (data = value));
    flushMicrotasks();
    const execution = http.expectOne(url);
    expect(execution.request.headers.get('X-CSRF-Token')).toBe('current-token');
    expect(execution.request.body.variables).toEqual({ oid: 'abc' });
    execution.flush({ data: { record: { oid: 'abc' } } });
    flushMicrotasks();
    expect(data).toEqual({ record: { oid: 'abc' } });
  }));
  it('parses catalogue responses at the accepted variable-depth boundary', fakeAsync(() => {
    let nested: import('./data-grid.model').JsonValue = 'leaf';
    for (let i = 0; i < 30; i++) nested = { nested };
    const saved = {
      version: 1,
      mode: 'graphql',
      id: '123456789012345678901234',
      revision: 1,
      name: 'Boundary query',
      document: '{ __typename }',
      variables: { extra: nested },
      resultPath: [],
    };
    let result: unknown;
    service.list().then(value => (result = value));
    flushMicrotasks();
    http.expectOne('/context/brand/portal/app/data-grids').flush({ data: { grids: [saved], next: null } });
    flushMicrotasks();
    expect(result).toEqual({ grids: [parseSavedQuery(saved)], next: null });
  }));
  it('requests bounded later catalogue pages', fakeAsync(() => {
    const after = '123456789012345678901234';
    let page: unknown;
    service.list(after).then(value => (page = value));
    flushMicrotasks();
    http.expectOne('/context/brand/portal/app/data-grids?after=' + after).flush({ data: { grids: [], next: null } });
    flushMicrotasks();
    expect(page).toEqual({ grids: [], next: null });
  }));
  it('loads a lightweight field catalogue and discovers stage scopes with authenticated, scoped HTTP', fakeAsync(() => {
    let result: GridScope[] = [];
    service.fields(scope).then(value => (result = value));
    flushMicrotasks();
    const req = http.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Accept')).toBe('application/graphql-response+json');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('current-token');
    expect(req.request.body.query).toBe(discoveryQuery(false));
    expect(req.request.body.query).not.toContain('responsePath');
    expect(req.request.body.variables).toEqual({ type: 'plan', stages: undefined, ids: undefined });
    req.flush({ data: { recordFields: discovery() } });
    flushMicrotasks();
    expect(result.length).toBe(1);
    expect(result[0].fields[0].label).toBe('Title');
    expect(result[0].fields[0].type).toBe('text'); // enum choices are hints, not an enum validator
  }));
  it('refreshes selected IDs then maps server fragments and direct page metadata without interpolating values', fakeAsync(() => {
    let result!: GridPage;
    const input = request();
    service.query(input).then(value => (result = value));
    flushMicrotasks();
    const fields = http.expectOne(url);
    expect(fields.request.body.variables.ids).toEqual([title.id, oid.id]);
    expect(fields.request.body.query).toContain('responsePath');
    fields.flush({ data: { recordFields: discovery() } });
    flushMicrotasks();
    const page = http.expectOne(url);
    expect(page.request.body.query).toContain(title.selections[0].selection);
    expect(page.request.body.query).not.toContain('injected');
    expect(page.request.body.variables).toEqual({
      type: 'plan',
      filters: [{ field: title.id, contains: 'x" } injected {' }],
      sort: [{ field: title.id, direction: 'DESC' }],
      first: 25,
      after: null,
    });
    page.flush({
      data: {
        records: {
          nodes: [
            { oid: 'one', metadata: { __typename: 'M_draft', g_title: 'First' } },
            { oid: 'two', metadata: { __typename: 'M_review' } },
          ],
          hasNextPage: true,
          endCursor: 'opaque',
        },
      },
    });
    flushMicrotasks();
    expect<unknown>(result.rows.map(row => row.values[title.id])).toEqual(['First', null]);
    expect<unknown>(result.rows[0].values[oid.id]).toBe('one');
    expect(result.pageInfo).toEqual({ hasNextPage: true, endCursor: 'opaque' });
  }));
  it('blocks filter type drift during fresh query discovery before issuing a collection request', fakeAsync(() => {
    const input = request();
    input.definition.filters = [{ fieldId: title.id, expectedScalarType: 'NUMBER', operator: 'eq', values: ['1.0'] }];
    let error: GridRequestError | undefined;
    service.query(input).catch(value => (error = value));
    flushMicrotasks();
    http.expectOne(url).flush({ data: { recordFields: discovery() } });
    flushMicrotasks();
    expect(error?.key).toBe('filter-type-changed');
    http.expectNone(url);
  }));
  it('blocks a filterable=false field even when stale operators remain in fresh discovery', fakeAsync(() => {
    let error: unknown;
    service.query(request()).catch(value => (error = value));
    flushMicrotasks();
    http.expectOne(url).flush({ data: { recordFields: discovery([{ ...title, filterable: false }, oid]) } });
    flushMicrotasks();
    expect(error).toBeDefined();
    http.expectNone(url);
  }));
  for (const [operator, values] of [
    ['exists', []],
    ['exists', ['true', 'false']],
    ['exists', ['yes']],
    ['contains', ['']],
    ['in', []],
    ['in', Array(21).fill('x')],
    ['eq', ['é'.repeat(129)]],
  ] as const)
    it(`refuses crafted ${operator} operands before any collection request`, fakeAsync(() => {
      const input = request();
      input.definition.filters = [{ fieldId: title.id, expectedScalarType: 'STRING', operator, values: [...values] }];
      let error: unknown;
      service.query(input).catch(value => (error = value));
      flushMicrotasks();
      http.expectOne(url).flush({ data: { recordFields: discovery() } });
      flushMicrotasks();
      expect(error).toBeDefined();
      http.expectNone(url);
    }));
  it('blocks sort drift during fresh discovery before sending a collection query', fakeAsync(() => {
    const input = request();
    input.definition.sort = { fieldId: title.id, expectedScalarType: 'NUMBER', direction: 'asc' };
    let error: GridRequestError | undefined;
    service.query(input).catch(value => (error = value));
    flushMicrotasks();
    http.expectOne(url).flush({ data: { recordFields: discovery() } });
    flushMicrotasks();
    expect(error?.key).toBe('sort-type-changed');
    http.expectNone(url);
  }));
  it('stops before collection when the catalogue revision changed', fakeAsync(() => {
    let error: GridRequestError | undefined;
    service.query(request()).catch(value => (error = value));
    flushMicrotasks();
    http.expectOne(url).flush({ data: { recordFields: discovery(undefined, 'r2') } });
    flushMicrotasks();
    expect(error?.key).toBe('schema-changed');
    http.expectNone(url);
  }));
  for (const [status, code, expected] of [
    [200, 'INVALID_CURSOR', 'cursor-expired'],
    [400, 'QUERY_LIMIT', 'query-limit'],
    [200, 'REINDEX_REQUIRED', 'reindex-required'],
    [200, 'COLLECTION_LIMIT', 'collection-limit'],
    [403, '', 'auth-required'],
    [503, '', 'query-unavailable'],
  ] as const) {
    it(`rejects ${status}/${code} without accepting partial data`, fakeAsync(() => {
      let error: GridRequestError | undefined;
      service.fields(scope).catch(value => (error = value));
      flushMicrotasks();
      http.expectOne(url).flush(
        {
          data: { recordFields: discovery() },
          errors: [{ message: 'private exception details', extensions: { code } }],
        },
        { status, statusText: 'Response' }
      );
      flushMicrotasks();
      expect(error?.key).toBe(expected);
      expect(error?.message).not.toContain('private');
    }));
  }
  it('lists, creates, reads, updates and deletes scoped definitions with CSRF and revisions', fakeAsync(() => {
    const saved = { ...request().definition, id: '123456789012345678901234', revision: 1 };
    const base = '/context/brand/portal/app/data-grids';
    let result: unknown;
    service.list().then(value => (result = value));
    flushMicrotasks();
    http.expectOne(base).flush({ data: { grids: [saved], next: null } });
    flushMicrotasks();
    expect(result).toEqual({ grids: [saved], next: null });
    service.save(request().definition).then(value => (result = value));
    flushMicrotasks();
    const create = http.expectOne(base);
    expect(create.request.method).toBe('POST');
    expect(create.request.headers.get('X-CSRF-Token')).toBe('current-token');
    expect(create.request.body).toEqual({ definition: request().definition });
    create.flush({ data: saved });
    flushMicrotasks();
    expect(result).toEqual(saved);
    service.read(saved.id).then(value => (result = value));
    flushMicrotasks();
    http.expectOne(`${base}/${saved.id}`).flush({ data: saved });
    flushMicrotasks();
    service.save(saved).then(value => (result = value));
    flushMicrotasks();
    const update = http.expectOne(`${base}/${saved.id}`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ definition: request().definition, revision: 1 });
    update.flush({ data: { ...saved, revision: 2 } });
    flushMicrotasks();
    service.remove({ ...saved, revision: 2 });
    flushMicrotasks();
    const remove = http.expectOne(`${base}/${saved.id}`);
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.body).toEqual({ revision: 2 });
    expect(remove.request.headers.get('X-CSRF-Token')).toBe('current-token');
    remove.flush({ data: { deleted: true } });
    flushMicrotasks();
  }));
  for (const [status, expected] of [
    [409, 'revision-conflict'],
    [404, 'grid-missing'],
    [403, 'auth-required'],
    [500, 'persistence-failed'],
  ] as const) {
    it(`maps persistence ${status} safely`, fakeAsync(() => {
      let error: GridRequestError | undefined;
      service.save(request().definition).catch(value => (error = value));
      flushMicrotasks();
      http
        .expectOne('/context/brand/portal/app/data-grids')
        .flush({ error: { code: 'private-details' } }, { status, statusText: 'Failed' });
      flushMicrotasks();
      expect(error?.key).toBe(expected);
    }));
  }
});

describe('Record grid protocol', () => {
  it('parses every saved definition member and rejects malformed responses before editor use', () => {
    const saved = { ...request().definition, id: '123456789012345678901234', revision: 1 };
    expect(parseSavedDefinition(saved)).toEqual(saved);
    for (const bad of [
      { ...saved, pageSize: '25' },
      { ...saved, sort: { fieldId: title.id, direction: 'asc', expectedScalarType: 'FLOAT' } },
      { ...saved, sort: { fieldId: title.id, expectedScalarType: 'STRING' as const, direction: 'up' } },
      { ...saved, filters: [null] },
      { ...saved, filters: [{ ...saved.filters[0], values: [42] }] },
      { ...saved, filters: [{ ...saved.filters[0], expectedScalarType: 'FLOAT' }] },
      { ...saved, filters: [{ ...saved.filters[0], query: '{ raw }' }] },
      { ...saved, revision: 1.5 },
      { ...saved, columns: [title.id, title.id] },
    ])
      expect(() => parseSavedDefinition(bad)).toThrow();
  });
  it('translates numeric, timestamp, boolean, empty text, missing values and IN with typed operands', () => {
    const extra = (id: string, scalarType: string) => ({
      ...title,
      id,
      scalarType,
      operators: ['EQ', 'IN', 'BETWEEN', 'EXISTS'],
    });
    const fields = [title, extra('number', 'INTEGER'), extra('time', 'DATETIME'), extra('boolean', 'BOOLEAN')];
    const found = parseDiscovery(discovery(fields), key => key);
    const scoped = { ...scope, fields: found.fields, revision: found.revision };
    const definition = {
      ...request().definition,
      columns: [title.id],
      filters: [
        { fieldId: 'number', expectedScalarType: 'INTEGER' as const, operator: 'between' as const, values: ['1', '2'] },
        {
          fieldId: 'time',
          expectedScalarType: 'DATETIME' as const,
          operator: 'eq' as const,
          values: ['2026-01-01T12:00:00+12:00'],
        },
        {
          fieldId: 'boolean',
          expectedScalarType: 'BOOLEAN' as const,
          operator: 'in' as const,
          values: ['true', 'false'],
        },
        { fieldId: title.id, expectedScalarType: 'STRING' as const, operator: 'eq' as const, values: [''] },
        { fieldId: title.id, expectedScalarType: 'STRING' as const, operator: 'exists' as const, values: ['false'] },
      ],
    };
    const payload = collectionRequest(queryFor(definition, scoped, 'cursor'), scoped, found);
    expect<unknown>(payload.variables.filters).toEqual([
      { field: 'number', between: { from: { number: 1 }, to: { number: 2 } } },
      { field: 'time', eq: { dateTime: '2026-01-01T00:00:00.000Z' } },
      { field: 'boolean', in: [{ boolean: true }, { boolean: false }] },
      { field: title.id, eq: { text: '' } },
      { field: title.id, exists: false },
    ]);
    expect(payload.variables.after).toBe('cursor');
  });
  it('uses exact nested response paths and returns null for nullable parents and inapplicable variants', () => {
    const nested = {
      ...title,
      selections: [
        {
          variant: 'M_draft',
          selection: '... on M_draft { a: details { b: title } }',
          responsePath: ['metadata', 'a', 'b'],
        },
      ],
    };
    const found = parseDiscovery(discovery([nested, oid]), key => key);
    const input = request();
    const page = parsePage(
      {
        nodes: [
          { oid: '1', metadata: { __typename: 'M_draft', a: { b: 'Nested' } } },
          { oid: '2', metadata: { __typename: 'M_draft', a: null } },
          { oid: '3', metadata: null },
        ],
        hasNextPage: false,
        endCursor: null,
      },
      input,
      found.fields
    );
    expect<unknown>(page.rows.map(row => row.values[title.id])).toEqual(['Nested', null, null]);
  });
  it('rejects malformed pages, missing aliases and non-scalar values', () => {
    const found = parseDiscovery(discovery(), key => key);
    for (const metadata of [
      { __typename: 'M_draft' },
      { __typename: 'M_draft', g_title: {} },
      { __typename: 'M_draft', g_title: 4 },
      { g_title: 'missing typename' },
    ]) {
      expect(() =>
        parsePage({ nodes: [{ oid: '1', metadata }], hasNextPage: false, endCursor: null }, request(), found.fields)
      ).toThrow();
    }
    expect(() => parsePage({ nodes: [], hasNextPage: true, endCursor: null }, request(), found.fields)).toThrow();
  });
  it('keeps partial-variant fields displayable and removes their filter/sort capabilities', () => {
    const partial = { ...title, availableInAllVariants: false };
    const opaque = { ...oid, scalarType: 'JSON' };
    const found = parseDiscovery(discovery([partial, opaque]), key => key);
    expect(found.fields[0].selectable).toBeTrue();
    expect(found.fields[0].operators).toEqual([]);
    expect(found.fields[0].sortable).toBeFalse();
    expect(found.fields[1].selectable).toBeFalse();
  });
});

describe('Record field translation keys', () => {
  it('preserves namespaced legacy keys when resolving institutional field labels', () => {
    const key = '@dmpt-uon-ethics-approval-status';
    const field = { ...title, labelKey: key, label: 'uon:ethics Approval Status' };
    const translate = jasmine
      .createSpy('translate')
      .and.callFake((input: string) => (input === key ? 'Ethics approval status' : input));
    expect(parseDiscovery(discovery([field]), translate).fields[0].label).toBe('Ethics approval status');
    expect(translate).toHaveBeenCalledWith(key);
  });
});

describe('Discovered repeated selections', () => {
  it('roundtrips stable choices with actual fragments and preserves grouped response values', () => {
    const people = {
      ...title,
      id: 'metadata:/people',
      scalarType: 'JSON',
      repeating: true,
      selections: [
        {
          variant: 'M_draft',
          selection: '... on M_draft { g_people: people { name email children { name } } }',
          responsePath: ['metadata', 'g_people'],
        },
      ],
    };
    const found = parseDiscovery(discovery([people]), key => key);
    expect(found.fields[0].selectable).toBeTrue();
    expect(found.fields[0].operators).toEqual([]);
    expect(found.fields[0].sortable).toBeFalse();
    const saved = parseSavedDefinition({
      ...emptyGrid(),
      id: '1234567890abcdef12345678',
      revision: 1,
      name: 'People',
      recordType: 'plan',
      columns: [people.id],
    });
    const input = queryFor(saved, { ...scope, fields: found.fields, revision: found.revision }, null);
    expect(collectionRequest(input, scope, found).query).toContain(people.selections[0].selection);
    const grouped = [
      { name: 'One', email: 'one@example.invalid', children: [{ name: 'Child' }] },
      { name: null, email: null, children: [] },
    ];
    const page = parsePage(
      {
        nodes: [
          { oid: '1', metadata: { __typename: 'M_draft', g_people: grouped } },
          { oid: '2', metadata: { __typename: 'M_draft', g_people: [] } },
        ],
        hasNextPage: true,
        endCursor: 'next',
      },
      input,
      found.fields
    );
    expect(page.rows.length).toBe(2);
    expect(JSON.stringify(page.rows[0].values[people.id])).toBe(JSON.stringify(grouped));
    expect(input.definition.columns).toEqual([people.id]);
    expect(() =>
      queryFor(
        { ...saved, sort: { fieldId: people.id, direction: 'asc', expectedScalarType: 'STRING' } },
        { ...scope, fields: found.fields },
        null
      )
    ).toThrow();
  });
});

describe('Discovered single-object selections', () => {
  it('roundtrips declared people with real fragments and no scalar capabilities', () => {
    const person = {
      ...title,
      id: 'metadata:/contributor_ci',
      scalarType: 'OBJECT',
      labelKey: '@dmpt-people-tab-ci',
      selections: [
        {
          variant: 'M_draft',
          selection: '... on M_draft { g_ci: contributor_ci { name email } }',
          responsePath: ['metadata', 'g_ci'],
        },
      ],
    };
    const found = parseDiscovery(discovery([person]), key =>
      key === '@dmpt-people-tab-ci' ? 'Chief investigator / primary investigator' : key
    );
    expect(found.fields[0].label).toBe('Chief investigator / primary investigator');
    expect(found.fields[0].selectable).toBeTrue();
    expect(found.fields[0].type).toBe('structured');
    expect(found.fields[0].operators).toEqual([]);
    expect(found.fields[0].sortable).toBeFalse();
    const saved = parseSavedDefinition({
      ...emptyGrid(),
      id: '1234567890abcdef12345678',
      revision: 1,
      name: 'CI',
      recordType: 'plan',
      columns: [person.id],
    });
    const input = queryFor(saved, { ...scope, fields: found.fields, revision: found.revision }, null);
    expect(collectionRequest(input, scope, found).query).toContain(person.selections[0].selection);
    const page = (value: unknown) =>
      parsePage(
        {
          nodes: [{ oid: '1', metadata: { __typename: 'M_draft', g_ci: value } }],
          hasNextPage: false,
          endCursor: null,
        },
        input,
        found.fields
      );
    expect(JSON.stringify(page({ name: 'One', email: null }).rows[0].values[person.id])).toBe(
      JSON.stringify({ name: 'One', email: null })
    );
    expect(page(null).rows[0].values[person.id]).toBeNull();
    for (const value of [[], 'person', 0, false]) expect(() => page(value)).toThrow();
  });
});
