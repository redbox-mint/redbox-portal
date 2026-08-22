import { APP_BASE_HREF } from "@angular/common";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ConfigService } from "./config.service";
import { getStubConfigService } from "./helper.spec";
import { LoggerService } from "./logger.service";
import { RecordActionResult, RecordService } from "./record.service";
import { UtilityService } from "./utility.service";

describe("RecordService", () => {
  let httpTestingController: HttpTestingController;
  let recordService: RecordService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: "base"
        },
        {
          provide: ConfigService,
          useValue: getStubConfigService()
        },
        LoggerService,
        UtilityService,
        RecordService
      ]
    });

    httpTestingController = TestBed.inject(HttpTestingController);
    recordService = TestBed.inject(RecordService);

    await recordService.waitForInit();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it("creates a UUID save request header", async () => {
    const createPromise = recordService.create({ title: "Test record" }, "rdmp");
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    const requestId = request.request.headers.get("X-ReDBox-Save-Request-Id");

    expect(request.request.method).toBe("POST");
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    request.flush({ meta: { outcome: "saved", success: true, oid: "oid-123" } });
    await expectAsync(createPromise).toBeResolvedTo(jasmine.objectContaining({
      outcome: "saved",
      oid: "oid-123"
    }));
  });

  it("requests API v2 and keeps the CSRF context on saves", async () => {
    const updatePromise = recordService.update("oid-123", { title: "Test record" });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);

    expect(request.request.method).toBe("PUT");
    expect(request.request.headers.get("X-ReDBox-Api-Version")).toBe("2.0");
    expect(request.request.context).toBeTruthy();

    request.flush({ meta: { outcome: "saved", success: true, oid: "oid-123" } });
    await updatePromise;
  });

  it("normalises a persisted warning without losing the oid", async () => {
    const updatePromise = recordService.update("oid-123", { title: "Test record" });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    request.flush({
      data: { oid: "oid-123" },
      meta: {
        outcome: "saved-with-warnings",
        success: true,
        oid: "oid-123",
        requestId: "11111111-1111-4111-8111-111111111111",
        problems: [{ kind: "processing", phase: "post-save", issues: [{ message: "hook failed" }] }],
        completion: { attachments: { status: "incomplete", items: [] } },
      },
    });

    const result = await updatePromise;
    expect(result.outcome).toBe("saved-with-warnings");
    expect(result.wasPersisted()).toBeTrue();
    expect(result.isComplete()).toBeFalse();
    expect(result.oid).toBe("oid-123");
    expect(result.requestId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.problems.length).toBe(1);
  });

  it("synthesises a confirmed non-save for a policy-level 403", async () => {
    const createPromise = recordService.create({ title: "Test record" }, "rdmp");
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    request.flush({ errors: [{ detail: "Not allowed" }] }, { status: 403, statusText: "Forbidden" });

    const result = await createPromise;
    expect(result.outcome).toBe("not-saved");
    expect(result.wasPersisted()).toBeFalse();
    expect(result.problems[0].kind).toBe("authorization");
    expect(result.problems[0].issues[0].message).toBe("Not allowed");
  });

  it("maps a validation 400 onto safe field issues", async () => {
    const createPromise = recordService.create({ title: "Test record" }, "rdmp");
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    request.flush(
      { errors: [{ detail: "Title is required", code: "required", source: { pointer: "/metadata/title" } }] },
      { status: 400, statusText: "Bad Request" }
    );

    const result = await createPromise;
    expect(result.outcome).toBe("not-saved");
    expect(result.problems[0].kind).toBe("validation");
    expect(result.problems[0].issues[0].pointer).toBe("/metadata/title");
    expect(result.problems[0].issues[0].code).toBe("required");
  });

  it("keeps a dispatched save uncertain when the response cannot be interpreted", async () => {
    const requestIds: string[] = [];

    const networkPromise = recordService.create({ title: "Test record" }, "rdmp");
    const networkRequest = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    requestIds.push(networkRequest.request.headers.get("X-ReDBox-Save-Request-Id")!);
    networkRequest.error(new ProgressEvent("network error"));
    const networkResult = await networkPromise;
    expect(networkResult.outcome).toBe("unknown");
    expect(networkResult.problems[0].kind).toBe("network");
    expect(networkResult.requestId).toBe(requestIds[0]);

    const serverPromise = recordService.create({ title: "Test record" }, "rdmp");
    const serverRequest = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    requestIds.push(serverRequest.request.headers.get("X-ReDBox-Save-Request-Id")!);
    serverRequest.flush("gateway exploded", { status: 502, statusText: "Bad Gateway" });
    const serverResult = await serverPromise;
    // A 5xx without a typed result proves nothing about persistence.
    expect(serverResult.outcome).toBe("unknown");
    expect(serverResult.problems[0].kind).toBe("system");

    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  it("treats a legacy success envelope as a complete save", async () => {
    const updatePromise = recordService.update("oid-123", { title: "Test record" });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    request.flush({ success: true, oid: "oid-123", message: "ok" });

    const result = await updatePromise;
    expect(result.outcome).toBe("saved");
    expect(result.isComplete()).toBeTrue();
    expect(result.completion.attachments.status).toBe("completed");
  });

  it("normalises a legacy post-save warning as persisted but incomplete", () => {
    const result = RecordActionResult.fromResponse({
      success: true,
      oid: "oid-warning",
      metadata: { postSaveSyncWarning: "true" }
    }, 200, "request-warning");

    expect(result.outcome).toBe("saved-with-warnings");
    expect(result.wasPersisted()).toBeTrue();
    expect(result.isComplete()).toBeFalse();
    expect(result.isSuccessful()).toBeTrue();
    expect(result.completion.attachments.status).toBe("unknown");
    expect(result.requestId).toBe("request-warning");
  });

  it("keeps malformed dispatched responses uncertain and maps safe issue fields", () => {
    const result = RecordActionResult.fromResponse({
      errors: [
        { title: "Title is invalid", field: "title" },
        { detail: "Pointer is invalid", pointer: "/metadata/description", code: "invalid" },
        { detail: "Nested pointer is invalid", source: { pointer: "/metadata/summary" } },
        { detail: "Ignored unsafe fields", field: 42, pointer: null }
      ]
    }, 500, "request-malformed");

    expect(result.outcome).toBe("unknown");
    expect(result.isSuccessful()).toBeFalse();
    expect(result.problems[0].kind).toBe("system");
    expect(result.problems[0].issues).toEqual([
      { message: "Title is invalid", field: "title" },
      { message: "Pointer is invalid", code: "invalid", pointer: "/metadata/description" },
      { message: "Nested pointer is invalid", pointer: "/metadata/summary" },
      { message: "Ignored unsafe fields" }
    ]);
  });

  it("normalises pre-dispatch failures and non-HTTP errors", () => {
    const notDispatched = RecordActionResult.notDispatched("Could not build request", "oid-1", "request-1");
    expect(notDispatched.outcome).toBe("not-saved");
    expect(notDispatched.oid).toBe("oid-1");
    expect(notDispatched.message).toBe("Could not build request");
    expect(notDispatched.requestId).toBe("request-1");
    expect(notDispatched.problems[0].phase).toBe("transport");

    const nonHttpError = RecordActionResult.fromHttpError(new Error("request failed"), "request-2");
    expect(nonHttpError.outcome).toBe("unknown");
    expect(nonHttpError.requestId).toBe("request-2");
    expect(nonHttpError.problems[0].kind).toBe("network");
  });

  it("unwraps attachment responses from the backend data envelope", async () => {
    const attachmentsPromise = recordService.getAttachments("oid-123");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/oid-123/attachments`);
    expect(request.request.method).toBe("GET");
    request.flush({
      data: [
        { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" }
      ]
    });

    await expectAsync(attachmentsPromise).toBeResolvedTo([
      { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" }
    ]);
  });

  it("accepts attachment responses returned as a raw array", async () => {
    const attachmentsPromise = recordService.getAttachments("oid-456");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/oid-456/attachments`);
    expect(request.request.method).toBe("GET");
    request.flush([
      { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-03-02T09:00:00Z" }
    ]);

    await expectAsync(attachmentsPromise).toBeResolvedTo([
      { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-03-02T09:00:00Z" }
    ]);
  });

  it("unwraps record audit tab responses", async () => {
    const auditPromise = recordService.getRecordAuditTab("oid-789");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/viewAudit/oid-789/audit`);
    expect(request.request.method).toBe("GET");
    request.flush({
      data: {
        summary: { returnedCount: 1 },
        rawAuditUrl: "/default/rdmp/api/records/audit/oid-789",
        records: [{ id: "audit-1", action: "updated" }]
      }
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 1 },
      rawAuditUrl: "/default/rdmp/api/records/audit/oid-789",
      records: [{ id: "audit-1", action: "updated" }]
    } as any);
  });

  it("accepts record audit tab responses returned without the data envelope", async () => {
    const auditPromise = recordService.getRecordAuditTab("oid-790");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/viewAudit/oid-790/audit`);
    expect(request.request.method).toBe("GET");
    request.flush({
      summary: { returnedCount: 1 },
      rawAuditUrl: "/default/rdmp/api/records/audit/oid-790",
      records: [{ id: "audit-2", action: "created" }]
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 1 },
      rawAuditUrl: "/default/rdmp/api/records/audit/oid-790",
      records: [{ id: "audit-2", action: "created" }]
    } as any);
  });

  it("includes filter query parameters for record audit requests", async () => {
    const auditPromise = recordService.getRecordAuditTab("oid-791", {
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      action: "updated",
      workflowState: "Draft"
    });

    const request = httpTestingController.expectOne(req =>
      req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-791/audit` &&
      req.params.get("dateFrom") === "2026-03-01" &&
      req.params.get("dateTo") === "2026-03-31" &&
      req.params.get("action") === "updated" &&
      req.params.get("workflowState") === "Draft"
    );
    expect(request.request.method).toBe("GET");
    request.flush({
      data: {
        summary: { returnedCount: 0 },
        rawAuditUrl: "/default/rdmp/api/records/audit/oid-791",
        records: []
      }
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 0 },
      rawAuditUrl: "/default/rdmp/api/records/audit/oid-791",
      records: []
    } as any);
  });

  it("unwraps record permissions responses", async () => {
    const permissionsPromise = recordService.getRecordPermissionsTab("oid-321");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/viewAudit/oid-321/permissions`);
    expect(request.request.method).toBe("GET");
    request.flush({
      data: {
        edit: [{ username: "editor", name: "Editor", email: "editor@example.com" }],
        view: [],
        editPending: ["pending-editor"],
        viewPending: [],
        editRoles: ["Admin"],
        viewRoles: ["Researcher"]
      }
    });

    await expectAsync(permissionsPromise).toBeResolvedTo({
      edit: [{ username: "editor", name: "Editor", email: "editor@example.com" }],
      view: [],
      editPending: ["pending-editor"],
      viewPending: [],
      editRoles: ["Admin"],
      viewRoles: ["Researcher"]
    });
  });

  it("accepts record permissions responses returned without the data envelope", async () => {
    const permissionsPromise = recordService.getRecordPermissionsTab("oid-322");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/viewAudit/oid-322/permissions`);
    expect(request.request.method).toBe("GET");
    request.flush({
      edit: [{ username: "editor", name: "Editor", email: "editor@example.com" }],
      view: [],
      editPending: ["pending-editor"],
      viewPending: [],
      editRoles: ["Admin"],
      viewRoles: ["Researcher"]
    });

    await expectAsync(permissionsPromise).toBeResolvedTo({
      edit: [{ username: "editor", name: "Editor", email: "editor@example.com" }],
      view: [],
      editPending: ["pending-editor"],
      viewPending: [],
      editRoles: ["Admin"],
      viewRoles: ["Researcher"]
    });
  });

  it("includes paging query parameters for integration audit requests", async () => {
    const integrationPromise = recordService.getRecordIntegrationAuditTab("oid-654", {
      page: 2,
      pageSize: 15,
      status: "success",
      integrationName: "figshare",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31"
    });

    const request = httpTestingController.expectOne(req =>
      req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-654/integration-audit` &&
      req.params.get("page") === "2" &&
      req.params.get("pageSize") === "15" &&
      req.params.get("status") === "success" &&
      req.params.get("integrationName") === "figshare" &&
      req.params.get("dateFrom") === "2026-01-01" &&
      req.params.get("dateTo") === "2026-01-31"
    );
    expect(request.request.method).toBe("GET");
    request.flush({
      data: {
        summary: { numFound: 3, page: 2, pageSize: 15, totalPages: 1 },
        records: [{
          id: "trace-1",
          traceId: "trace-1",
          startedAt: "2026-01-01T00:00:00Z",
          status: "success",
          actions: ["publish"],
          eventCount: 1,
          events: [{ id: "integration-1", redboxOid: "oid-654", startedAt: "2026-01-01T00:00:00Z", status: "success", integrationAction: "publish", traceId: "trace-1", spanId: "span-1", depth: 0, hasChildren: false }]
        }]
      }
    });

    await expectAsync(integrationPromise).toBeResolvedTo({
      summary: { numFound: 3, page: 2, pageSize: 15, totalPages: 1 },
      records: [{
        id: "trace-1",
        traceId: "trace-1",
        startedAt: "2026-01-01T00:00:00Z",
        status: "success",
        actions: ["publish"],
        eventCount: 1,
        events: [{ id: "integration-1", redboxOid: "oid-654", startedAt: "2026-01-01T00:00:00Z", status: "success", integrationAction: "publish", traceId: "trace-1", spanId: "span-1", depth: 0, hasChildren: false }]
      }]
    } as any);
  });

  it("accepts integration audit responses returned without the data envelope", async () => {
    const integrationPromise = recordService.getRecordIntegrationAuditTab("oid-655");

    const request = httpTestingController.expectOne(req =>
      req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-655/integration-audit`
    );
    expect(request.request.method).toBe("GET");
    request.flush({
      summary: { numFound: 1, page: 1, pageSize: 20, totalPages: 1 },
      records: [{
        id: "trace-2",
        traceId: "trace-2",
        startedAt: "2026-01-01T00:00:00Z",
        status: "success",
        actions: ["publish"],
        eventCount: 1,
        events: [{ id: "integration-2", redboxOid: "oid-655", startedAt: "2026-01-01T00:00:00Z", status: "success", integrationAction: "publish", traceId: "trace-2", spanId: "span-2", depth: 0, hasChildren: false }]
      }]
    });

    await expectAsync(integrationPromise).toBeResolvedTo({
      summary: { numFound: 1, page: 1, pageSize: 20, totalPages: 1 },
      records: [{
        id: "trace-2",
        traceId: "trace-2",
        startedAt: "2026-01-01T00:00:00Z",
        status: "success",
        actions: ["publish"],
        eventCount: 1,
        events: [{ id: "integration-2", redboxOid: "oid-655", startedAt: "2026-01-01T00:00:00Z", status: "success", integrationAction: "publish", traceId: "trace-2", spanId: "span-2", depth: 0, hasChildren: false }]
      }]
    } as any);
  });
});
