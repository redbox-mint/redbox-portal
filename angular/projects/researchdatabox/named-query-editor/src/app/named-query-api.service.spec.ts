import { HttpContext } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { APP_BASE_HREF } from '@angular/common';
import { NamedQueryApiService, NamedQueryDefinition } from './named-query-api.service';
import { LoggerService, UtilityService, ConfigService, getStubConfigService } from '@researchdatabox/portal-ng-common';

describe('NamedQueryApiService', () => {
  let service: NamedQueryApiService;
  let httpMock: HttpTestingController;
  const stubConfig = getStubConfigService();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        NamedQueryApiService,
        LoggerService,
        UtilityService,
        { provide: ConfigService, useValue: stubConfig },
        { provide: APP_BASE_HREF, useValue: '/base' },
      ],
    });

    service = TestBed.inject(NamedQueryApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize and enable CSRF header', async () => {
    const initPromise = service.waitForInit();
    // waitForInit triggers config service wait, then sets up URLs and CSRF
    const result = await initPromise;
    expect(result).toBe(service);
  });

  it('should list named queries', async () => {
    await service.waitForInit();
    const mockQueries: NamedQueryDefinition[] = [
      { name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    ];

    const promise = service.list();
    const req = httpMock.expectOne(request => request.url.includes('/api/named-query'));
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockQueries });

    const result = await promise;
    expect(result).toEqual(mockQueries);
  });

  it('should get a named query by name', async () => {
    await service.waitForInit();
    const mockQuery: NamedQueryDefinition = {
      name: 'q1',
      collectionName: 'c1',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };

    const promise = service.get('q1');
    const req = httpMock.expectOne(request => request.url.includes('/api/named-query/q1'));
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockQuery });

    const result = await promise;
    expect(result).toEqual(mockQuery);
  });

  it('should create a named query', async () => {
    await service.waitForInit();
    const payload: NamedQueryDefinition = {
      name: 'q1',
      collectionName: 'c1',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };

    const promise = service.create(payload);
    const req = httpMock.expectOne(request => request.url.includes('/api/named-query'));
    expect(req.request.method).toBe('POST');
    req.flush({ data: { name: 'q1' } });

    const result = await promise;
    expect(result).toEqual({ name: 'q1' });
  });

  it('should update a named query', async () => {
    await service.waitForInit();
    const payload: NamedQueryDefinition = {
      name: 'q1',
      collectionName: 'c1',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };

    const promise = service.update('q1', payload);
    const req = httpMock.expectOne(request => request.url.includes('/api/named-query/q1'));
    expect(req.request.method).toBe('PUT');
    req.flush({ data: { name: 'q1' } });

    const result = await promise;
    expect(result).toEqual({ name: 'q1' });
  });

  it('should delete a named query', async () => {
    await service.waitForInit();
    const promise = service.delete('q1');
    const req = httpMock.expectOne(request => request.url.includes('/api/named-query/q1'));
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { name: 'q1' } });

    const result = await promise;
    expect(result).toEqual({ name: 'q1' });
  });

  it('should unwrap unwrapped responses', async () => {
    await service.waitForInit();
    const mockQuery: NamedQueryDefinition = {
      name: 'q1',
      collectionName: 'c1',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };

    const promise = service.get('q1');
    const req = httpMock.expectOne(request => request.url.includes('/api/named-query/q1'));
    req.flush(mockQuery);

    const result = await promise;
    expect(result).toEqual(mockQuery);
  });

  it('should encode special characters in query names', async () => {
    await service.waitForInit();
    const promise = service.get('test/query');
    const req = httpMock.expectOne(request =>
      request.url.includes('/api/named-query/' + encodeURIComponent('test/query'))
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: { name: 'test/query', collectionName: 'c', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    });
    await promise;
  });
});

describe('NamedQuery editor assistance requests', () => {
  let service: NamedQueryApiService;
  let http: HttpTestingController;
  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        NamedQueryApiService,
        LoggerService,
        UtilityService,
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: APP_BASE_HREF, useValue: '/base' },
      ],
    });
    service = TestBed.inject(NamedQueryApiService);
    http = TestBed.inject(HttpTestingController);
    await service.waitForInit();
  });
  afterEach(() => http.verify());
  it('discovers schema targets through the editor route and unwraps API v2', async () => {
    const pending = service.schemaTargets();
    const req = http.expectOne(r => r.url.endsWith('/editor/schema-targets'));
    expect(req.request.method).toBe('GET');
    req.flush({ data: { recordTypes: [] }, meta: {} });
    expect(await pending).toEqual({ recordTypes: [] });
  });
  it('keeps optional type/stage guidance in GET parameters, accepting API v1', async () => {
    const pending = service.fields({ collectionName: 'record', recordType: 'rdmp', stage: 'draft' });
    const req = http.expectOne(r => r.url.endsWith('/editor/fields'));
    expect(req.request.params.get('collectionName')).toBe('record');
    expect(req.request.params.get('recordType')).toBe('rdmp');
    expect(req.request.params.get('stage')).toBe('draft');
    req.flush({ fields: [] });
    expect((await pending).fields).toEqual([]);
  });
  it('uses the named-query schema boundary and keeps review acknowledgement separate from executable data', async () => {
    const schema = service.graphqlSchema();
    const schemaRequest = http.expectOne(request => request.url.endsWith('/editor/graphql-schema'));
    expect(schemaRequest.request.method).toBe('GET');
    schemaRequest.flush({ data: { sdl: 'type Query { field: String }' } });
    await schema;
    const definition: NamedQueryDefinition = {
      source: 'graphql',
      name: 'same',
      graphql: { document: 'query { field }', variables: {}, resultPath: [] },
    };
    const review = service.reviewUpdate('same', definition);
    const request = http.expectOne(request => request.url.endsWith('/same/review-update'));
    expect(request.request.body).toEqual({ definition });
    expect(request.request.context).toBe(schemaRequest.request.context);
    request.flush({
      data: { required: true, changes: ['source'], usedBy: [], usageComplete: false, confirmation: 'bound' },
    });
    const reviewed = await review;
    const update = service.update('same', definition, reviewed.confirmation);
    const saved = http.expectOne(request => request.url.endsWith('/same'));
    expect(saved.request.headers.get('X-ReDBox-Named-Query-Confirmation')).toBe('bound');
    expect(saved.request.body).toEqual(definition);
    saved.flush({ data: { name: 'same' } });
    await update;
  });
  it('filters and pages saved explorer queries within the scoped editor boundary', async () => {
    const pending = service.savedQueries({ q: 'Hunter', mode: 'graphql', after: 'opaque cursor' });
    const request = http.expectOne(req => req.url.endsWith('/editor/saved-queries'));
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('q')).toBe('Hunter');
    expect(request.request.params.get('mode')).toBe('graphql');
    expect(request.request.params.get('after')).toBe('opaque cursor');
    request.flush({ data: { grids: [], next: null } });
    expect(await pending).toEqual({ grids: [], next: null });
  });
  it('prepares the exact saved revision with CSRF context and preserves conflicts', async () => {
    const pending = service.fromSavedQuery('saved-id', 7);
    const request = http.expectOne(req => req.url.endsWith('/editor/from-saved-query'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ id: 'saved-id', revision: 7 });
    expect(request.request.context).toBe((service as unknown as { httpContext: HttpContext }).httpContext);
    request.flush({ message: 'Revision changed' }, { status: 409, statusText: 'Conflict' });
    await expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ status: 409 }));
  });
  it('keeps GraphQL response data/errors intact through the caller-scoped GraphQL endpoint', async () => {
    const pending = service.graphqlRead('query Q { records { nodes { oid } } }', { first: 5 }, 'Q');
    const request = http.expectOne(req => req.url.endsWith('/api/graphql'));
    expect(request.request.body).toEqual({
      query: 'query Q { records { nodes { oid } } }',
      variables: { first: 5 },
      operationName: 'Q',
    });
    expect(request.request.context).toBe((service as unknown as { httpContext: HttpContext }).httpContext);
    request.flush({ data: { records: null }, errors: [{ message: 'Access denied' }] });
    expect(await pending).toEqual({ data: { records: null }, errors: [{ message: 'Access denied' }] });
  });
  for (const action of ['validate', 'describe', 'preview'] as const) {
    it(`POSTs an unsaved ${action} with CSRF context and preserves structured refusals`, async () => {
      const request = {
        definition: { collectionName: 'record', mongoQuery: {} },
        guidance: { recordType: 'rdmp' },
        parameters: { createdAfter: -7 },
      };
      const pending = service[action](request);
      const req = http.expectOne(r => r.url.endsWith('/editor/' + action));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);
      expect(req.request.context).toBe((service as unknown as { httpContext: HttpContext }).httpContext);
      req.flush({ data: { valid: false, diagnostics: [{ severity: 'error', field: 'relatedRecordFilters' }] } });
      const result = await pending;
      expect(result.valid).toBeFalse();
      expect(result.diagnostics[0].severity).toBe('error');
    });
  }
});
