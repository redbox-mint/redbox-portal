import { TestBed } from "@angular/core/testing";
import { APP_BASE_HREF } from "@angular/common";
import { HttpContext } from "@angular/common/http";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import {
  ConfigService,
  getStubConfigService,
  LoggerService,
  UtilityService,
} from "@researchdatabox/portal-ng-common";
import { VocabTreeService } from "./vocab-tree.service";

describe("VocabTreeService", () => {
  let service: VocabTreeService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_BASE_HREF, useValue: "" },
        { provide: ConfigService, useValue: getStubConfigService() },
        LoggerService,
        UtilityService,
        VocabTreeService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(VocabTreeService);
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

  it("builds children URL without parentId for root fetch", async () => {
    const promise = service.getChildren("anzsrc-2020-for");
    await Promise.resolve();
    const req = httpTesting.expectOne((request) => {
      return request.method === "GET" && request.url.includes("/vocab/anzsrc-2020-for/children");
    });

    expect(req.request.params.keys().length).toBe(0);
    req.flush({
      data: [{ id: "r1", label: "Root", value: "01", hasChildren: true }],
      meta: { vocabularyId: "v1", parentId: null, total: 1 },
    });
    const result = await promise;
    expect(result.data.length).toBe(1);
    expect(result.meta.parentId).toBeNull();
  });

  it("builds children URL with parentId query param", async () => {
    const promise = service.getChildren("anzsrc-2020-for", "r1");
    await Promise.resolve();
    const req = httpTesting.expectOne((request) => {
      return request.method === "GET" &&
        request.url.includes("/vocab/anzsrc-2020-for/children") &&
        request.params.get("parentId") === "r1";
    });

    req.flush({
      data: [{ id: "c1", label: "Child", value: "0101", parent: "r1", hasChildren: false }],
      meta: { vocabularyId: "v1", parentId: "r1", total: 1 },
    });
    const result = await promise;
    expect(result.data[0].parent).toBe("r1");
    expect(result.meta.total).toBe(1);
  });

  it("accepts legacy array response shape and synthesizes meta", async () => {
    const promise = service.getChildren("anzsrc-2020-for");
    await Promise.resolve();
    const req = httpTesting.expectOne((request) => {
      return request.method === "GET" && request.url.includes("/vocab/anzsrc-2020-for/children");
    });

    req.flush([
      { id: "r1", label: "Root", value: "01", parent: null, hasChildren: true },
      { id: "r2", label: "Another", value: "02", parent: null, hasChildren: false },
    ]);
    const result = await promise;
    expect(result.data.length).toBe(2);
    expect(result.meta.vocabularyId).toBe("anzsrc-2020-for");
    expect(result.meta.parentId).toBeNull();
    expect(result.meta.total).toBe(2);
  });
});
