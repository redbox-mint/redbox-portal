import { TestBed } from "@angular/core/testing";
import { APP_BASE_HREF } from "@angular/common";
import { HttpContext, HttpErrorResponse } from "@angular/common/http";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import {
    ConfigService,
    getStubConfigService,
    LoggerService,
    UtilityService
} from "@researchdatabox/portal-ng-common";
import { TypeaheadDataService } from "./typeahead-data.service";

describe("TypeaheadDataService", () => {
    let service: TypeaheadDataService;
    let httpTesting: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                { provide: APP_BASE_HREF, useValue: "" },
                { provide: ConfigService, useValue: getStubConfigService() },
                LoggerService,
                UtilityService,
                TypeaheadDataService,
                provideHttpClient(),
                provideHttpClientTesting(),
            ],
        });
        service = TestBed.inject(TypeaheadDataService);
        httpTesting = TestBed.inject(HttpTestingController);
        spyOn(service, "waitForInit").and.resolveTo(service);
        (service as any).brandingAndPortalUrl = "http://localhost/default/rdmp";
        (service as any).httpContext = new HttpContext();
    });

    afterEach(() => {
        if (httpTesting) {
            httpTesting.verify();
        }
    });

    it("filters static options by label/value", async () => {
        const result = await service.searchStatic("br", [
            { label: "Alpha", value: "a" },
            { label: "Bravo", value: "b" },
            { label: "Charlie", value: "c" }
        ]);
        expect(result.length).toBe(1);
        expect(result[0].label).toBe("Bravo");
        expect(result[0].sourceType).toBe("static");
    });

    it("normalizes vocabulary endpoint data shape", async () => {
        const promise = service.searchVocabularyEntries("access-rights", "op", 10, 0);
        await Promise.resolve();

        const req = httpTesting.expectOne((request) =>
            request.method === "GET" &&
            request.url.includes("/vocab/access-rights/entries") &&
            request.params.get("search") === "op"
        );
        req.flush({
            data: [
                { label: "Open", value: "open" },
                { label: "Closed", value: "closed" }
            ]
        });
        const result = await promise;
        expect(result.length).toBe(2);
        expect(result[0].sourceType).toBe("vocabulary");
    });

    it("requests historical vocabulary entries when asked", async () => {
        const promise = service.searchVocabularyEntries("access-rights", "leg", 10, 0, true);
        await Promise.resolve();

        const req = httpTesting.expectOne((request) =>
            request.method === "GET" &&
            request.url.includes("/vocab/access-rights/entries") &&
            request.params.get("search") === "leg" &&
            request.params.get("includeHistoricalValues") === "true"
        );
        req.flush({
            data: [
                { label: "Legacy", value: "legacy", historical: true }
            ]
        });

        const result = await promise;
        expect(result.length).toBe(1);
        expect(result[0].historical).toBeTrue();
    });

    it("normalizes named query response.docs shape with mapping paths", async () => {
        const promise = service.searchNamedQuery("contributors", "ja", 0, 10, "person.display.label", "person.id");
        await Promise.resolve();

        const req = httpTesting.expectOne((request) =>
            request.method === "GET" &&
            request.url.includes("/query/vocab/contributors")
        );
        req.flush({
            data: {
                response: {
                    docs: [
                        { person: { display: { label: "Jane Doe" }, id: "jane-1" } },
                        { person: { display: { label: "John Smith" }, id: "john-2" } }
                    ]
                }
            }
        });

        const result = await promise;
        expect(result.length).toBe(2);
        expect(result[0].label).toBe("Jane Doe");
        expect(result[0].value).toBe("jane-1");
        expect(result[0].sourceType).toBe("namedQuery");
    });

    it("normalizes external provider response using resultArrayProperty", async () => {
        const promise = service.searchExternal("geonamesCountries", "aus", "response.docs", "utf8_name", "utf8_name");
        await Promise.resolve();

        const req = httpTesting.expectOne((request) =>
            request.method === "POST" &&
            request.url.includes("/external/vocab/geonamesCountries")
        );
        expect(req.request.body).toEqual({
            options: {
                query: "aus"
            }
        });
        req.flush({
            data: {
                response: {
                    docs: [
                        { utf8_name: "Australia" },
                        { utf8_name: "Austria" }
                    ]
                }
            }
        });

        const result = await promise;
        expect(result.length).toBe(2);
        expect(result[0].label).toBe("Australia");
        expect(result[0].value).toBe("Australia");
        expect(result[0].sourceType).toBe("external");
    });

    describe("in-flight request dedup", () => {
        it("collapses concurrent identical named-query lookups into a single request", async () => {
            const p1 = service.searchNamedQuery("party", "Clair Meade", 0, 25);
            const p2 = service.searchNamedQuery("party", "Clair Meade", 0, 25);
            await Promise.resolve();

            const req = httpTesting.expectOne((request) =>
                request.method === "GET" &&
                request.url.includes("/query/vocab/party") &&
                request.params.get("search") === "Clair Meade"
            );
            req.flush({ records: [{ label: "Clair Meade", value: "u-1" }] });

            const [r1, r2] = await Promise.all([p1, p2]);
            expect(r1[0].label).toBe("Clair Meade");
            expect(r2[0].label).toBe("Clair Meade");
        });

        it("re-fetches once the in-flight request has resolved (no result caching)", async () => {
            const p1 = service.searchVocabularyEntries("access-rights", "op", 10, 0);
            await Promise.resolve();
            const req1 = httpTesting.expectOne((request) =>
                request.url.includes("/vocab/access-rights/entries") && request.params.get("search") === "op"
            );
            req1.flush([{ label: "Open", value: "open" }]);
            await p1;

            const p2 = service.searchVocabularyEntries("access-rights", "op", 10, 0);
            await Promise.resolve();
            // Same key, but the first request has resolved — expect a fresh network call.
            const req2 = httpTesting.expectOne((request) =>
                request.url.includes("/vocab/access-rights/entries") && request.params.get("search") === "op"
            );
            req2.flush([{ label: "Open (updated)", value: "open" }]);
            const result = await p2;
            expect(result[0].label).toBe("Open (updated)");
        });
    });

    it("posts service lookup request and normalizes wrapped response", async () => {
        const promise = service.searchService("contributors", "jan", 5, 20);
        await Promise.resolve();

        const req = httpTesting.expectOne((request) =>
            request.method === "POST" &&
            request.url.includes("/service/vocab/contributors")
        );
        expect(req.request.body).toEqual({
            search: "jan",
            start: 5,
            rows: 20
        });
        req.flush({
            data: [
                {
                    label: "Jane Doe",
                    value: "party-1",
                    historical: true,
                    disabled: true,
                    raw: { id: "party-1" }
                }
            ],
            meta: {
                total: 1
            }
        });

        const result = await promise;
        expect(result).toEqual([
            {
                label: "Jane Doe",
                value: "party-1",
                sourceType: "service",
                historical: true,
                disabled: true,
                raw: { id: "party-1" }
            }
        ]);
    });
});


describe("bounded named-query lookup compatibility", () => {
    let service: TypeaheadDataService;
    let http: HttpTestingController;
    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [
            { provide: APP_BASE_HREF, useValue: "" }, { provide: ConfigService, useValue: getStubConfigService() },
            LoggerService, UtilityService, TypeaheadDataService, provideHttpClient(), provideHttpClientTesting()
        ] });
        service = TestBed.inject(TypeaheadDataService);
        http = TestBed.inject(HttpTestingController);
        spyOn(service, "waitForInit").and.resolveTo(service);
    });
    afterEach(() => http.verify());
    const page = (count: number, more: boolean) => ({ source: 'graphql',
        records: Array.from({ length: count }, (_, i) => ({ oid: `id-${i}`, title: `Match ${i}` })),
        summary: { numFound: null, start: 0, page: 1 }, pagination: { mode: 'firstPage', hasNextPage: more } });
    for (const [count, more, rows] of [[0, false, 25], [25, false, 25], [25, true, 25], [3, true, 3]] as const) {
        it(`retains unknown total and genuine continuation for ${count}/${more}/${rows}`, async () => {
            const pending = service.searchNamedQueryLookup('party', 'a', 0, rows);
            await Promise.resolve();
            const request = http.expectOne(req => req.url.includes('/query/vocab/party'));
            expect(request.request.params.get('start')).toBe('0');
            expect(request.request.params.get('rows')).toBe(String(rows));
            request.flush({ data: page(count, more) });
            const result = await pending;
            expect(result.options.length).toBe(count);
            expect(result.pagination?.hasNextPage).toBe(more);
            if (result.source !== 'graphql') throw new Error('Expected GraphQL source');
            expect(result.summary.numFound).toBeNull();
            if (count) expect(result.options[0].value).toBe('id-0');
        });
    }
    it('keeps the array API as a narrow wrapper for bounded requests', async () => {
        const pending = service.searchNamedQuery('party', 'a', 0, 25);
        await Promise.resolve();
        const request = http.expectOne(req => req.url.includes('/query/vocab/party'));
        expect(request.request.params.get('rows')).toBe('25');
        request.flush(page(25, true));
        expect((await pending).length).toBe(25);
    });
    for (const source of ['database', 'graphql']) {
        it(`preserves requested 50 rows with a ${source} response`, async () => {
            const pending = service.searchNamedQueryLookup('party', 'a', 0, 50);
            await Promise.resolve();
            const request = http.expectOne(req => req.url.includes('/query/vocab/party'));
            expect(request.request.params.get('rows')).toBe('50');
            request.flush(source === 'graphql' ? page(25, true) : {
                records: Array.from({ length: 50 }, (_, i) => ({ label: `Match ${i}`, value: `id-${i}` }))
            });
            const result = await pending;
            expect(result.options.length).toBe(source === 'graphql' ? 25 : 50);
            expect(result.source).toBe(source === 'graphql' ? 'graphql' : undefined);
        });
    }
    for (const search of [undefined, null, '', '   ']) {
        it(`preserves legacy ${String(search)} searches on the wire`, async () => {
            const pending = service.searchNamedQuery('party', search);
            await Promise.resolve();
            const request = http.expectOne(req => req.url.includes('/query/vocab/party'));
            expect(request.request.params.get('search')).toBe(String(search ?? ''));
            request.flush([{ label: 'Default choice', value: 'default' }]);
            expect((await pending)[0].value).toBe('default');
        });
    }
    it('deduplicates legacy null, undefined and empty terms using their wire value', async () => {
        const pending = [undefined, null, ''].map(search => service.searchNamedQuery('party', search));
        expect(pending[0]).toBe(pending[1]);
        expect(pending[1]).toBe(pending[2]);
        await Promise.resolve();
        const request = http.expectOne(req => req.url.includes('/query/vocab/party'));
        expect(request.request.params.get('search')).toBe('');
        request.flush([{ label: 'Default choice', value: 'default' }]);
        expect((await Promise.all(pending)).every(options => options[0].value === 'default')).toBeTrue();
    });
    for (const rows of [10, 50]) {
        it(`preserves HttpErrorResponse for the legacy ${rows}-row wrapper`, async () => {
            const pending = service.searchNamedQuery('party', 'a', 0, rows);
            const failure = pending.catch((error: unknown) => error);
            await Promise.resolve();
            const body = { message: 'INVALID_GRAPHQL_NAMED_QUERY' };
            http.expectOne(req => req.url.includes('/query/vocab/party')).flush(body, {
                status: 422, statusText: 'Unprocessable Content'
            });
            const error = await failure;
            expect(error instanceof HttpErrorResponse).toBeTrue();
            if (!(error instanceof HttpErrorResponse)) throw new Error('Expected original HTTP error');
            expect(error.status).toBe(422);
            expect(error.error).toEqual(body);
        });
    }
    it('suppresses empty input and rejects offsets without making a request', async () => {
        expect(await service.searchNamedQueryLookup('party', '')).toEqual({ options: [] });
        await expectAsync(service.searchNamedQueryLookup('party', 'a', 1)).toBeRejected();
        http.expectNone(req => req.url.includes('/query/vocab/'));
    });
    for (const invalid of [
        { ...page(1, false), summary: { numFound: 1, start: 0, page: 1 } },
        { ...page(1, false), pagination: undefined },
        { ...page(1, false), records: [{ title: 'Label without identity' }] },
        { ...page(1, false), records: [{ oid: 'id', title: '' }] },
        page(26, true), page(1, true), { ...page(0, false), errors: [{ message: 'failed' }] }
    ]) {
        it('rejects malformed metadata/rows instead of returning an empty success', async () => {
            const pending = service.searchNamedQueryLookup('party', 'a');
            const rejected = expectAsync(pending).toBeRejected();
            await Promise.resolve();
            http.expectOne(req => req.url.includes('/query/vocab/party')).flush(invalid);
            await rejected;
        });
    }
    it('retains legacy database path mapping and array shape without guessed continuation', async () => {
        const pending = service.searchNamedQueryLookup('party', 'a', 0, 25, 'metadata.fullName', 'oid');
        await Promise.resolve();
        http.expectOne(req => req.url.includes('/query/vocab/party')).flush({ records: [
            { oid: 'party-1', metadata: { fullName: 'Jane' } }
        ], summary: { numFound: 100, start: 0, page: 1 } });
        const result = await pending;
        expect(result.options[0].label).toBe('Jane');
        expect(result.options[0].value).toBe('party-1');
        expect(result.pagination).toBeUndefined();
    });
    for (const body of [{ message: 'GRAPHQL_LOOKUP_CONFIG_INVALID' }, { errors: [{ code: 'GRAPHQL_LOOKUP_UNSUPPORTED' }], meta: {} }]) {
        it('recognizes incompatible configuration in either API error version', async () => {
            const pending = service.searchNamedQueryLookup('party', 'a');
            const rejected = expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ misconfigured: true }));
            await Promise.resolve();
            http.expectOne(req => req.url.includes('/query/vocab/party')).flush(body, { status: 422, statusText: 'Unprocessable Content' });
            await rejected;
        });
    }
    // Exact FormVocabularyController/CoreController envelopes, also asserted over
    // HTTP in NamedQueryExecution.test.ts for a schema-drifted saved definition.
    for (const [version, body] of [
        ['1.0', { message: 'INVALID_GRAPHQL_NAMED_QUERY', details: '' }],
        ['2.0', { errors: [{ code: 'INVALID_GRAPHQL_NAMED_QUERY', title: 'INVALID_GRAPHQL_NAMED_QUERY' }], meta: {} }]
    ] as const) {
        it(`classifies the real API ${version} invalid-definition envelope as misconfigured`, async () => {
            const pending = service.searchNamedQueryLookup('party', 'a');
            const rejected = expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ misconfigured: true }));
            await Promise.resolve();
            http.expectOne(req => req.url.includes('/query/vocab/party')).flush(body, { status: 422, statusText: 'Unprocessable Content' });
            await rejected;
        });
    }
    it('keeps a real scan-bound HTTP failure distinct from no results and misconfiguration', async () => {
        const pending = service.searchNamedQueryLookup('party', 'a');
        const rejected = expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ misconfigured: false }));
        await Promise.resolve();
        http.expectOne(req => req.url.includes('/query/vocab/party')).flush({ message: 'COLLECTION_LIMIT' }, { status: 422, statusText: 'Unprocessable Content' });
        await rejected;
    });

    it('preserves legacy database array paging while the new lookup method is first-page-only', async () => {
        const pending = service.searchNamedQuery('party', 'a', 30, 10, 'title', 'oid');
        await Promise.resolve();
        const request = http.expectOne(req => req.url.includes('/query/vocab/party'));
        expect(request.request.params.get('start')).toBe('30');
        expect(request.request.params.get('rows')).toBe('10');
        request.flush({ records: [{ oid: 'a', title: 'Alpha' }], summary: { numFound: 31, start: 30, page: 4 } });
        expect((await pending)[0].value).toBe('a');
    });

    it('preserves the legacy database zero-row sentinel in the array API', async () => {
        const pending = service.searchNamedQuery('party', 'a', 0, 0, 'title', 'oid');
        await Promise.resolve();
        const request = http.expectOne(req => req.url.includes('/query/vocab/party'));
        expect(request.request.params.get('rows')).toBe('0');
        request.flush({ records: [{ oid: 'a', title: 'Alpha' }], summary: { numFound: 1, start: 0, page: 1 } });
        expect((await pending)[0].value).toBe('a');
    });

});
