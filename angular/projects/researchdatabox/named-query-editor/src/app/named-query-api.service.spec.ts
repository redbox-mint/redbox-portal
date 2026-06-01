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
        { provide: APP_BASE_HREF, useValue: '/base' }
      ]
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
      { name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    ];

    const promise = service.list();
    const req = httpMock.expectOne((request) => request.url.includes('/api/named-query'));
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockQueries });

    const result = await promise;
    expect(result).toEqual(mockQueries);
  });

  it('should get a named query by name', async () => {
    await service.waitForInit();
    const mockQuery: NamedQueryDefinition = {
      name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {}
    };

    const promise = service.get('q1');
    const req = httpMock.expectOne((request) => request.url.includes('/api/named-query/q1'));
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockQuery });

    const result = await promise;
    expect(result).toEqual(mockQuery);
  });

  it('should create a named query', async () => {
    await service.waitForInit();
    const payload: NamedQueryDefinition = {
      name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {}
    };

    const promise = service.create(payload);
    const req = httpMock.expectOne((request) => request.url.includes('/api/named-query'));
    expect(req.request.method).toBe('POST');
    req.flush({ data: { name: 'q1' } });

    const result = await promise;
    expect(result).toEqual({ name: 'q1' });
  });

  it('should update a named query', async () => {
    await service.waitForInit();
    const payload: NamedQueryDefinition = {
      name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {}
    };

    const promise = service.update('q1', payload);
    const req = httpMock.expectOne((request) => request.url.includes('/api/named-query/q1'));
    expect(req.request.method).toBe('PUT');
    req.flush({ data: { name: 'q1' } });

    const result = await promise;
    expect(result).toEqual({ name: 'q1' });
  });

  it('should delete a named query', async () => {
    await service.waitForInit();
    const promise = service.delete('q1');
    const req = httpMock.expectOne((request) => request.url.includes('/api/named-query/q1'));
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { name: 'q1' } });

    const result = await promise;
    expect(result).toEqual({ name: 'q1' });
  });

  it('should unwrap unwrapped responses', async () => {
    await service.waitForInit();
    const mockQuery: NamedQueryDefinition = {
      name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {}
    };

    const promise = service.get('q1');
    const req = httpMock.expectOne((request) => request.url.includes('/api/named-query/q1'));
    req.flush(mockQuery);

    const result = await promise;
    expect(result).toEqual(mockQuery);
  });

  it('should encode special characters in query names', async () => {
    await service.waitForInit();
    const promise = service.get('test/query');
    const req = httpMock.expectOne((request) =>
      request.url.includes('/api/named-query/' + encodeURIComponent('test/query'))
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: { name: 'test/query', collectionName: 'c', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} } });
    await promise;
  });
});
