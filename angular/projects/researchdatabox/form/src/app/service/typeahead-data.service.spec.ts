import { TestBed } from "@angular/core/testing";
import { APP_BASE_HREF } from "@angular/common";
import { HttpContext } from "@angular/common/http";
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

});
